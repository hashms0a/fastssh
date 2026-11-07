//! Data model: IPC shape (spec 6.1-6.3) + legacy disk shape.

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
pub struct Host {
    pub id: String,
    pub name: String,
    pub group: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: String,
    pub identity_file: String,
    pub account: String,
    pub color: String,
    pub font: String,
    pub tunnels: String,
    pub extra_arguments: String,
    pub ssh_config: String,
    /// True only for the built-in in-memory Localhost; never saved to disk.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub local: Option<bool>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
pub struct Account {
    pub id: String,
    pub name: String,
    pub username: String,
    pub password: String,
    pub identity_file: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
pub struct Bookmark {
    pub id: String,
    pub name: String,
    pub command: String,
}

fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

/// Read the first key present as a String (numbers stringify). Never panics.
fn s(o: &serde_json::Map<String, Value>, keys: &[&str]) -> String {
    keys.iter()
        .find_map(|k| o.get(*k))
        .and_then(|v| match v {
            Value::String(x) => Some(x.clone()),
            Value::Number(n) => Some(n.to_string()),
            _ => None,
        })
        .unwrap_or_default()
}

fn read_id(o: &serde_json::Map<String, Value>) -> String {
    let id = s(o, &["id"]);
    if id.is_empty() { new_id() } else { id }
}

/// Accepts legacy (kebab-case, port as string) and FastSSH shapes.
/// Records without a name are skipped with a warning.
pub fn host_from_value(v: &Value, warnings: &mut Vec<String>) -> Option<Host> {
    let o = v.as_object()?;
    let name = s(o, &["name"]).trim().replace(' ', "-");
    if name.is_empty() {
        warnings.push("Skipped a host with no name".into());
        return None;
    }
    let port_raw = s(o, &["port"]);
    let port = match port_raw.trim().parse::<u16>() {
        Ok(p) if p > 0 => p,
        _ if port_raw.trim().is_empty() => 22,
        _ => {
            warnings.push(format!(
                "Host \"{name}\": invalid port \"{port_raw}\", using 22"
            ));
            22
        }
    };
    Some(Host {
        id: read_id(o),
        name,
        port,
        group: s(o, &["group"]),
        host: s(o, &["host"]),
        username: s(o, &["username"]),
        password: s(o, &["password"]),
        identity_file: s(o, &["identity_file", "identity-file"]),
        account: s(o, &["account"]),
        color: s(o, &["color"]),
        font: s(o, &["font"]),
        tunnels: s(o, &["tunnels"]),
        extra_arguments: s(o, &["extra_arguments", "extra-arguments"]),
        ssh_config: s(o, &["ssh_config"]),
        local: o
            .get("local")
            .and_then(Value::as_bool)
            .filter(|b| *b)
            .map(|_| true),
    })
}

/// Disk shape: legacy keys so EasySSH can still read the file.
pub fn host_to_value(h: &Host) -> Value {
    serde_json::json!({
        "id": h.id, "name": h.name, "group": h.group, "host": h.host,
        "port": h.port.to_string(), "username": h.username, "password": h.password,
        "identity-file": h.identity_file, "account": h.account, "color": h.color,
        "font": h.font, "tunnels": h.tunnels, "extra-arguments": h.extra_arguments,
        "ssh_config": h.ssh_config,
    })
}

pub fn account_from_value(v: &Value, warnings: &mut Vec<String>) -> Option<Account> {
    let o = v.as_object()?;
    let name = s(o, &["name"]).trim().to_string();
    if name.is_empty() {
        warnings.push("Skipped an account with no name".into());
        return None;
    }
    Some(Account {
        id: read_id(o),
        name,
        username: s(o, &["username"]),
        password: s(o, &["password"]),
        identity_file: s(o, &["identity_file", "identity-file"]),
    })
}

pub fn account_to_value(a: &Account) -> Value {
    serde_json::json!({
        "id": a.id, "name": a.name, "username": a.username,
        "password": a.password, "identity-file": a.identity_file,
    })
}

pub fn bookmark_from_value(v: &Value, warnings: &mut Vec<String>) -> Option<Bookmark> {
    let o = v.as_object()?;
    let name = s(o, &["name"]).trim().to_string();
    if name.is_empty() {
        warnings.push("Skipped a bookmark with no name".into());
        return None;
    }
    Some(Bookmark {
        id: read_id(o),
        name,
        command: s(o, &["command"]),
    })
}

pub fn bookmark_to_value(b: &Bookmark) -> Value {
    serde_json::json!({ "id": b.id, "name": b.name, "command": b.command })
}

pub fn to_json_array<T>(items: &[T], to_value: fn(&T) -> Value) -> Vec<u8> {
    let arr: Vec<Value> = items.iter().map(to_value).collect();
    serde_json::to_vec_pretty(&arr).unwrap_or_else(|_| b"[]".to_vec())
}

#[cfg(test)]
mod tests;
