//! PTY sessions (task 4.2): one reader thread and one wait thread per session.
//!
//! Output is decoded at chunk boundaries by `Utf8Chunker` and emitted as
//! `pty-output-<sessionId>`; the child's exit code as `pty-exit-<sessionId>`.
//! `clone_killer()` lets kill() drop the lock before `wait()` returns.

use crate::env_sanitize;
use crate::utf8_chunker::Utf8Chunker;
use portable_pty::{ChildKiller, CommandBuilder, MasterPty, PtySize, native_pty_system};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

/// What to run inside the PTY. `Ssh` holds the command line Stage 5 builds;
/// it is written into `/bin/sh` as ` exec <line>\n` so the PTY exits with it.
pub enum SpawnSpec {
    LocalShell,
    Ssh(String),
}

/// Decoupled from `AppHandle` so unit tests can capture events in a Vec.
pub trait SessionEmitter: Send + Sync + 'static {
    fn emit_output(&self, session_id: &str, text: &str);
    fn emit_exit(&self, session_id: &str, code: i32);
}

impl SessionEmitter for AppHandle {
    fn emit_output(&self, session_id: &str, text: &str) {
        let _ = self.emit(&format!("pty-output-{session_id}"), text);
    }
    fn emit_exit(&self, session_id: &str, code: i32) {
        let _ = self.emit(&format!("pty-exit-{session_id}"), code);
    }
}

struct Session {
    writer: Box<dyn Write + Send>,
    master: Box<dyn MasterPty + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
}

#[derive(Default)]
pub struct PtyManager {
    sessions: Arc<Mutex<HashMap<String, Session>>>,
}

const READ_BUF: usize = 16 * 1024;

/// A poisoned sessions map is useless only if a panic lost data mid-update;
/// nothing here can panic while holding the lock. Recovering the inner value
/// instead of unwrapping keeps `kill_all()` running at exit, so no ssh child
/// is orphaned (R20) even if some other thread panicked.
fn lock_sessions(
    sessions: &Arc<Mutex<HashMap<String, Session>>>,
) -> std::sync::MutexGuard<'_, HashMap<String, Session>> {
    sessions
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

impl PtyManager {
    /// Spawn `spec` in a new PTY and register it under `session_id`.
    pub fn spawn(
        &self,
        emitter: Arc<dyn SessionEmitter>,
        session_id: String,
        spec: SpawnSpec,
        cols: u16,
        rows: u16,
    ) -> Result<(), String> {
        let pair = native_pty_system()
            .openpty(PtySize {
                rows: rows.max(1),
                cols: cols.max(2),
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;

        let env = env_sanitize::clean_env();
        let shell = match &spec {
            SpawnSpec::LocalShell => env
                .get("SHELL")
                .cloned()
                .unwrap_or_else(|| "/bin/sh".into()),
            // The ssh line is typed into a plain shell, like EasySSH does.
            SpawnSpec::Ssh(_) => "/bin/sh".into(),
        };
        let mut cmd = CommandBuilder::new(&shell);
        env_sanitize::sanitize_pty_command(&mut cmd); // env_clear + clean env FIRST
        if let Some(home) = env.get("HOME") {
            cmd.cwd(home);
        }

        let mut child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
        drop(pair.slave); // else the reader never sees EOF
        let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
        let mut writer = pair.master.take_writer().map_err(|e| e.to_string())?;

        if let SpawnSpec::Ssh(line) = &spec {
            // Leading space keeps the line out of the shell history; `exec`
            // makes the PTY exit with ssh's own code.
            writer
                .write_all(format!(" exec {line}\n").as_bytes())
                .map_err(|e| e.to_string())?;
            writer.flush().map_err(|e| e.to_string())?;
        }

        let killer = child.clone_killer();
        lock_sessions(&self.sessions).insert(
            session_id.clone(),
            Session {
                writer,
                master: pair.master,
                killer,
            },
        );

        let (em_r, id_r) = (emitter.clone(), session_id.clone());
        std::thread::spawn(move || {
            let mut buf = [0u8; READ_BUF];
            let mut dec = Utf8Chunker::default();
            loop {
                match reader.read(&mut buf) {
                    // Ok(0) or Err(EIO on Linux) both mean the child is gone.
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        let text = dec.push(&buf[..n]);
                        if !text.is_empty() {
                            em_r.emit_output(&id_r, &text);
                        }
                    }
                }
            }
        });

        let sessions = self.sessions.clone();
        std::thread::spawn(move || {
            let code = child.wait().map(|s| s.exit_code() as i32).unwrap_or(-1);
            lock_sessions(&sessions).remove(&session_id);
            emitter.emit_exit(&session_id, code);
        });
        Ok(())
    }

    pub fn write(&self, session_id: &str, data: &str) -> Result<(), String> {
        let mut map = lock_sessions(&self.sessions);
        match map.get_mut(session_id) {
            Some(s) => {
                s.writer
                    .write_all(data.as_bytes())
                    .map_err(|e| e.to_string())?;
                s.writer.flush().map_err(|e| e.to_string())?;
                Ok(())
            }
            None => Err(format!("no session {session_id}")),
        }
    }

    pub fn resize(&self, session_id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let map = lock_sessions(&self.sessions);
        match map.get(session_id) {
            Some(s) => s
                .master
                .resize(PtySize {
                    rows: rows.max(1),
                    cols: cols.max(2),
                    pixel_width: 0,
                    pixel_height: 0,
                })
                .map_err(|e| e.to_string()),
            None => Err(format!("no session {session_id}")),
        }
    }

    pub fn kill(&self, session_id: &str) {
        if let Some(mut s) = lock_sessions(&self.sessions).remove(session_id) {
            let _ = s.killer.kill();
        }
    }

    /// RunEvent::Exit: no ssh/sh process may outlive the app.
    pub fn kill_all(&self) {
        let mut map = lock_sessions(&self.sessions);
        for (_, mut s) in map.drain() {
            let _ = s.killer.kill();
        }
    }

    pub fn session_count(&self) -> usize {
        lock_sessions(&self.sessions).len()
    }
}

#[cfg(test)]
mod tests {
    use super::{PtyManager, SessionEmitter, SpawnSpec};
    use std::sync::{Arc, Mutex};
    use std::time::{Duration, Instant};

    #[derive(Default)]
    struct Collector {
        events: Mutex<Vec<String>>,
    }
    impl Collector {
        fn new() -> Arc<Self> {
            Arc::new(Self::default())
        }
        fn has(&self, needle: &str) -> bool {
            self.events
                .lock()
                .unwrap()
                .iter()
                .any(|e| e.contains(needle))
        }
        fn wait_for(&self, needle: &str, secs: u64) -> bool {
            let deadline = Instant::now() + Duration::from_secs(secs);
            while Instant::now() < deadline {
                if self.has(needle) {
                    return true;
                }
                std::thread::sleep(Duration::from_millis(30));
            }
            false
        }
    }
    impl SessionEmitter for Collector {
        fn emit_output(&self, session_id: &str, text: &str) {
            self.events
                .lock()
                .unwrap()
                .push(format!("out:{session_id}:{text}"));
        }
        fn emit_exit(&self, session_id: &str, code: i32) {
            self.events
                .lock()
                .unwrap()
                .push(format!("exit:{session_id}:{code}"));
        }
    }

    fn spawn(mgr: &PtyManager, col: &Arc<Collector>, id: &str, line: &str) {
        mgr.spawn(
            col.clone(),
            id.to_string(),
            SpawnSpec::Ssh(line.to_string()),
            80,
            24,
        )
        .expect("spawn");
    }

    #[test]
    fn spawn_write_reads_back_and_exits() {
        let mgr = PtyManager::default();
        let col = Collector::new();
        spawn(&mgr, &col, "s1", "echo hi");

        assert!(col.wait_for("hi", 5), "expected the echo output");
        assert!(col.wait_for("exit:s1:0", 5), "expected exit code 0");
        assert_eq!(mgr.session_count(), 0);
    }

    #[test]
    fn typed_input_reaches_the_child() {
        // A real shell (LocalShell) fed through write(), like the UI does.
        let mgr = PtyManager::default();
        let col = Collector::new();
        mgr.spawn(col.clone(), "s2".into(), SpawnSpec::LocalShell, 80, 24)
            .expect("spawn");
        mgr.write("s2", "echo $TERM\n").expect("write");
        assert!(
            col.wait_for("xterm-256color", 6),
            "TERM must reach the child"
        );
        mgr.kill("s2");
        assert!(col.wait_for("exit:s2:", 6), "kill produces an exit event");
    }

    #[test]
    fn kill_all_ends_every_child() {
        let mgr = PtyManager::default();
        let col = Collector::new();
        for i in 0..3 {
            spawn(&mgr, &col, &format!("sleep{i}"), "sleep 60");
        }
        assert_eq!(mgr.session_count(), 3);
        mgr.kill_all();
        assert_eq!(mgr.session_count(), 0);
        for i in 0..3 {
            assert!(
                col.wait_for(&format!("exit:sleep{i}:"), 10),
                "session {i} never reported an exit"
            );
        }
    }

    #[test]
    fn write_and_resize_reject_an_unknown_session() {
        let mgr = PtyManager::default();
        assert!(mgr.write("nope", "x").is_err());
        assert!(mgr.resize("nope", 80, 24).is_err());
        mgr.kill("nope"); // killing a gone session is a no-op, not an error
    }
}
