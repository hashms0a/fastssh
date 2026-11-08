//! Acceptance (Stage 7, `[unit]`): the sftp URL shape, the http(s)-only
//! scheme check, and the launcher order through an injected runner, so no
//! real program starts.

use super::{is_web_url, launch_plan, launch_with, open_web_url, sftp_url};

#[test]
fn sftp_url_for_a_plain_host() {
    assert_eq!(
        sftp_url("tester", "127.0.0.1", 2222),
        "sftp://tester@127.0.0.1:2222/"
    );
    assert_eq!(
        sftp_url("root", "example.com", 22),
        "sftp://root@example.com:22/"
    );
}

#[test]
fn sftp_url_omits_an_empty_user() {
    assert_eq!(sftp_url("", "10.0.0.7", 22), "sftp://10.0.0.7:22/");
}

#[test]
fn sftp_url_percent_encodes_the_user() {
    // A space, an '@' and a '/' must not break the authority apart.
    assert_eq!(
        sftp_url("a b", "host", 22),
        "sftp://a%20b@host:22/",
        "space becomes %20"
    );
    assert_eq!(
        sftp_url("ad@min", "host", 2222),
        "sftp://ad%40min@host:2222/"
    );
    assert_eq!(sftp_url("us/er", "host", 22), "sftp://us%2Fer@host:22/");
    assert_eq!(
        sftp_url("a-b.c_d~e", "host", 22),
        "sftp://a-b.c_d~e@host:22/"
    );
    let encoded = sftp_url("Пользователь", "host", 22);
    assert!(encoded.starts_with("sftp://%D0%9F"), "{encoded}");
    assert!(
        !encoded.contains('П'),
        "non-ASCII bytes are percent-encoded"
    );
}

#[test]
fn sftp_url_brackets_an_ipv6_host() {
    assert_eq!(sftp_url("u", "::1", 22), "sftp://u@[::1]:22/");
    assert_eq!(
        sftp_url("u", "fe80::1%eth0", 2222),
        "sftp://u@[fe80::1%25eth0]:2222/",
        "the zone id stays percent-encoded inside the brackets"
    );
    assert_eq!(sftp_url("", "::1", 22), "sftp://[::1]:22/");
    // An address someone already wrote with brackets is not bracketed twice.
    assert_eq!(sftp_url("u", "[::1]", 22), "sftp://u@[::1]:22/");
}

#[test]
fn only_http_and_https_are_web_urls() {
    assert!(is_web_url("http://example.com"));
    assert!(is_web_url("https://example.com/x?y=1"));
    assert!(
        is_web_url("HTTPS://Example.COM"),
        "the scheme is case-insensitive"
    );
    for refused in [
        "file:///etc/passwd",
        "javascript:alert(1)",
        "ssh://user@host",
        "sftp://host:22/",
        "ftp://host",
        "mailto:a@b.c",
        "httpx://example.com",
        "",
    ] {
        assert!(!is_web_url(refused), "{refused} must be refused");
    }
}

#[test]
fn open_web_url_refuses_other_schemes_without_running_anything() {
    for bad in ["file:///etc/passwd", "javascript:alert(1)", "ssh://u@h"] {
        let err = open_web_url(bad).expect_err("must refuse");
        assert!(err.contains(bad), "the error names the url: {err}");
        assert!(err.contains("http://"), "the error says what is allowed");
    }
}

#[test]
fn the_plan_starts_with_xdg_open_and_adds_kde_fallbacks() {
    assert_eq!(
        desktop_names("sftp://h:22/", "ubuntu:GNOME"),
        vec!["xdg-open"],
        "non-KDE stops after xdg-open"
    );
    assert_eq!(
        desktop_names("sftp://h:22/", "KDE"),
        vec!["xdg-open", "kioclient", "dolphin"]
    );
    assert_eq!(
        desktop_names("sftp://h:22/", "kde:plasma"),
        desktop_names("sftp://h:22/", "KDE"),
        "the desktop match is case-insensitive"
    );

    let plan = launch_plan("sftp://h:22/", "KDE");
    assert_eq!(
        plan[1].1.args,
        vec!["exec".to_string(), "sftp://h:22/".to_string()]
    );
    assert!(plan[1].1.wait.is_some(), "kioclient is waited for");
    assert!(plan[2].1.wait.is_none(), "dolphin is spawned and reaped");
}

fn desktop_names(url: &str, desktop: &str) -> Vec<&'static str> {
    launch_plan(url, desktop)
        .iter()
        .map(|(name, _)| *name)
        .collect()
}

#[test]
fn launch_order_with_an_injected_runner() {
    // xdg-open succeeds at once: nothing else runs, on either desktop.
    let mut ran: Vec<&'static str> = Vec::new();
    let ok = launch_with("sftp://h:22/", "ubuntu:GNOME", &mut |spec| {
        ran.push(spec.program);
        true
    });
    assert_eq!(ok, Ok("xdg-open"));
    assert_eq!(ran, vec!["xdg-open"]);

    // On KDE, xdg-open fails -> kioclient runs and succeeds.
    let mut ran: Vec<&'static str> = Vec::new();
    let ok = launch_with("sftp://h:22/", "KDE", &mut |spec| {
        ran.push(spec.program);
        spec.program == "kioclient"
    });
    assert_eq!(ok, Ok("kioclient"));
    assert_eq!(ran, vec!["xdg-open", "kioclient"]);

    // kioclient fails too -> dolphin (detached) is the last resort.
    let mut ran: Vec<&'static str> = Vec::new();
    let ok = launch_with("sftp://h:22/", "KDE", &mut |spec| {
        ran.push(spec.program);
        spec.program == "dolphin"
    });
    assert_eq!(ok, Ok("dolphin"));
    assert_eq!(ran, vec!["xdg-open", "kioclient", "dolphin"]);

    // On GNOME everything stops after the failing xdg-open.
    let mut ran: Vec<&'static str> = Vec::new();
    let err = launch_with("sftp://h:22/", "ubuntu:GNOME", &mut |spec| {
        ran.push(spec.program);
        false
    });
    assert_eq!(ran, vec!["xdg-open"]);
    assert!(
        err.unwrap_err().contains("sftp://h:22/"),
        "the error names the URL"
    );
}

#[test]
fn the_failure_message_names_the_url_for_copying() {
    let err = launch_with("sftp://tester@127.0.0.1:2222/", "ubuntu:GNOME", &mut |_| {
        false
    })
    .expect_err("no launcher accepted the url");
    assert!(err.contains("sftp://tester@127.0.0.1:2222/"));
    assert!(err.contains("Copy this address"));
}
