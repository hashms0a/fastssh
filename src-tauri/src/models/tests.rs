use super::*;
use serde_json::json;

fn sample_host() -> Host {
    Host {
        id: "h-1".into(),
        name: "db-10".into(),
        group: "Lab".into(),
        host: "10.0.0.1".into(),
        port: 2222,
        username: "u".into(),
        password: "p".into(),
        identity_file: "~/.ssh/id".into(),
        account: "lab-key".into(),
        color: "rgb(0,43,54)".into(),
        font: "Monospace 11".into(),
        tunnels: "-L 18080:localhost:80".into(),
        extra_arguments: "-o X=1".into(),
        ssh_config: "Host db-10\n".into(),
        local: None,
    }
}

#[test]
fn host_round_trip_keeps_every_field() {
    let mut w = vec![];
    let h = sample_host();
    let back = host_from_value(&host_to_value(&h), &mut w).unwrap();
    assert_eq!(back, h);
    assert!(w.is_empty());
}

#[test]
fn legacy_kebab_and_string_port_parse() {
    let mut w = vec![];
    let v = json!({
        "name": "item10", "host": "127.0.0.1", "port": "2222",
        "username": "tester", "group": "Lab",
        "identity-file": "/k/id", "extra-arguments": "-o C=1",
        "tunnels": "-L 18080:localhost:80", "account": ""
    });
    let h = host_from_value(&v, &mut w).unwrap();
    assert_eq!(h.port, 2222);
    assert_eq!(h.identity_file, "/k/id");
    assert_eq!(h.extra_arguments, "-o C=1");
    assert!(!h.id.is_empty(), "missing id gets a fresh UUID");
    assert!(w.is_empty());
}

#[test]
fn snake_case_keys_parse_too() {
    let mut w = vec![];
    let v = json!({ "name": "a", "identity_file": "/a", "extra_arguments": "-v" });
    let h = host_from_value(&v, &mut w).unwrap();
    assert_eq!(
        (h.identity_file.as_str(), h.extra_arguments.as_str()),
        ("/a", "-v")
    );
}

#[test]
fn port_string_number_and_garbage() {
    let mut w = vec![];
    assert_eq!(
        host_from_value(&json!({"name":"a","port":"2222"}), &mut w)
            .unwrap()
            .port,
        2222
    );
    assert_eq!(
        host_from_value(&json!({"name":"a","port":2222}), &mut w)
            .unwrap()
            .port,
        2222
    );
    assert_eq!(
        host_from_value(&json!({"name":"a","port":"abc"}), &mut w)
            .unwrap()
            .port,
        22
    );
    assert_eq!(
        host_from_value(&json!({"name":"a"}), &mut w).unwrap().port,
        22
    );
    assert_eq!(w.len(), 1, "only the garbage port warns");
}

#[test]
fn spaces_in_names_become_dashes_and_names_are_required() {
    let mut w = vec![];
    let h = host_from_value(&json!({"name": "my server"}), &mut w).unwrap();
    assert_eq!(h.name, "my-server");
    assert!(host_from_value(&json!({"name": "  "}), &mut w).is_none());
    assert_eq!(w.len(), 1);
}

#[test]
fn local_flag_survives_ipc_and_drops_from_disk_shape() {
    let mut h = sample_host();
    h.local = Some(true);
    let ipc: Host = serde_json::from_value(serde_json::to_value(&h).unwrap()).unwrap();
    assert_eq!(ipc.local, Some(true));
    let disk = host_to_value(&h);
    assert!(
        disk.get("local").is_none(),
        "local is not part of the disk shape"
    );
}

#[test]
fn account_round_trip_and_kebab_key() {
    let mut w = vec![];
    let a = Account {
        id: "a1".into(),
        name: "lab-key".into(),
        username: "keyuser".into(),
        password: "s3cret".into(),
        identity_file: "~/id".into(),
    };
    assert_eq!(
        account_from_value(&account_to_value(&a), &mut w).unwrap(),
        a
    );
    let legacy = json!({"name":"n","username":"u","identity-file":"/k"});
    assert_eq!(
        account_from_value(&legacy, &mut w).unwrap().identity_file,
        "/k"
    );
    assert!(account_from_value(&json!({}), &mut w).is_none());
}

#[test]
fn bookmark_round_trip() {
    let mut w = vec![];
    let b = Bookmark {
        id: "b1".into(),
        name: "uptime".into(),
        command: "uptime".into(),
    };
    assert_eq!(
        bookmark_from_value(&bookmark_to_value(&b), &mut w).unwrap(),
        b
    );
    assert!(bookmark_from_value(&json!({"command":"x"}), &mut w).is_none());
}

#[test]
fn to_json_array_uses_the_disk_shape() {
    let bytes = to_json_array(&[sample_host()], host_to_value);
    let v: Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(v[0]["port"], "2222", "port is a STRING on disk");
    assert!(v[0].get("identity-file").is_some());
}

#[test]
fn debug_redacts_the_password() {
    let mut h = sample_host();
    h.password = "hunter2-pass".into();
    let text = format!("{h:?}");
    assert!(!text.contains("hunter2-pass"), "{text}");
    assert!(text.contains("<redacted>"), "{text}");
    assert!(text.contains("db-10"), "the rest is still visible");
}
