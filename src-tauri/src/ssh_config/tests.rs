//! Task 9.1: the parser keeps blocks, patterns and raw lines verbatim.

use super::*;
use crate::ssh_config::test_support::*;

#[test]
fn parses_the_fixture_into_blocks_and_keeps_lines_verbatim() {
    let blocks = parse(SAMPLE);
    assert_eq!(
        blocks.len(),
        8,
        "preamble + 5 host + negated + match + Host *"
    );
    assert_eq!(blocks[0].kind, BlockKind::Preamble);
    assert_eq!(
        blocks[0].lines[0],
        "# global options before any Host (preamble, must be preserved)"
    );
    assert_eq!(blocks[1].kind, BlockKind::Host);
    assert_eq!(
        blocks[1].patterns,
        vec!["web1".to_string(), "web-alias".to_string()]
    );
    assert_eq!(
        blocks[5].patterns,
        vec!["!negated".to_string(), "*.corp".to_string()]
    );
    assert_eq!(blocks[6].kind, BlockKind::Match);
    assert_eq!(blocks[7].patterns, vec!["*".to_string()]);
    // tab indentation and `Key=Value` survive untouched
    assert_eq!(blocks[3].lines[1], "\tHostName 10.0.0.2");
    assert_eq!(blocks[2].lines[1], "  HostName=10.0.0.10");
}

#[test]
fn keywords_are_case_insensitive_and_crlf_is_tolerated() {
    let blocks = parse("HOST Win\r\n    hostname=10.0.0.9\r\n    USER =  bob\r\n");
    assert_eq!(blocks.len(), 1);
    assert_eq!(blocks[0].patterns, vec!["Win".to_string()]);
    assert_eq!(field(&blocks[0], "hostname").as_deref(), Some("10.0.0.9"));
    assert_eq!(field(&blocks[0], "user").as_deref(), Some("bob"));
    assert_eq!(
        blocks[0].lines[1], "    hostname=10.0.0.9",
        "no CR left behind"
    );
}

#[test]
fn comments_and_blank_lines_belong_to_their_block() {
    let blocks = parse("# top\nHost a\n# note\n\nPort 2200\n\nHost b\n    User u\n");
    assert_eq!(blocks.len(), 3);
    assert_eq!(blocks[0].kind, BlockKind::Preamble);
    assert_eq!(
        blocks[1].lines,
        vec!["Host a", "# note", "", "Port 2200", ""]
    );
    assert_eq!(field(&blocks[1], "port").as_deref(), Some("2200"));
}

#[test]
fn quoted_values_are_unquoted_and_a_space_path_survives() {
    let blocks = parse("Host db2\n\tIdentityFile \"~/key dir/id_space\"\n");
    assert_eq!(
        field(&blocks[0], "identityfile").as_deref(),
        Some("~/key dir/id_space")
    );
}
