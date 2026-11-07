//! Split-safe UTF-8 decoding of PTY byte chunks (task 4.1).
//!
//! A PTY reader gets arbitrary byte slices: a multi-byte sequence can be cut
//! in the middle. `push` decodes what is complete, keeps at most 3 trailing
//! bytes of an incomplete sequence for the next call, and turns invalid bytes
//! into U+FFFD.

#[derive(Default)]
pub struct Utf8Chunker {
    pending: Vec<u8>,
}

/// A truncated UTF-8 sequence is at most 4 bytes, so at most 3 can be pending.
const MAX_PENDING: usize = 3;

impl Utf8Chunker {
    /// Decode `bytes`, continuing a sequence left over by the previous push.
    pub fn push(&mut self, bytes: &[u8]) -> String {
        let mut buf = std::mem::take(&mut self.pending);
        buf.extend_from_slice(bytes);

        let mut out = String::new();
        let mut i = 0;
        while i < buf.len() {
            match std::str::from_utf8(&buf[i..]) {
                Ok(s) => {
                    out.push_str(s);
                    break;
                }
                Err(e) => {
                    let valid = e.valid_up_to();
                    if valid > 0 {
                        // valid_up_to() guarantees this prefix decodes cleanly.
                        out.push_str(std::str::from_utf8(&buf[i..i + valid]).unwrap());
                    }
                    match e.error_len() {
                        // Truncated at the end: keep it, decode it with the next chunk.
                        None => {
                            let rest = &buf[i + valid..];
                            if rest.len() <= MAX_PENDING {
                                self.pending.extend_from_slice(rest);
                            } else {
                                // Should not happen; drop it rather than grow forever.
                                out.push('\u{FFFD}');
                            }
                        }
                        // A definitely invalid byte sequence: one replacement char.
                        Some(n) => {
                            out.push('\u{FFFD}');
                            i += valid + n;
                            continue;
                        }
                    }
                    break;
                }
            }
        }
        out
    }

    /// Bytes still held for the next push (0..3). Used by tests.
    pub fn pending_len(&self) -> usize {
        self.pending.len()
    }
}

#[cfg(test)]
mod tests {
    use super::Utf8Chunker;

    #[test]
    fn empty_push_yields_nothing() {
        let mut c = Utf8Chunker::default();
        assert_eq!(c.push(&[]), "");
        assert_eq!(c.pending_len(), 0);
    }

    #[test]
    fn plain_ascii_passes_through() {
        let mut c = Utf8Chunker::default();
        assert_eq!(c.push(b"hello\r\n"), "hello\r\n");
    }

    #[test]
    fn splits_a_four_byte_emoji() {
        let emoji = "🍉".as_bytes(); // F0 9F 8D 89
        assert_eq!(emoji.len(), 4);
        let mut c = Utf8Chunker::default();
        assert_eq!(c.push(&emoji[..1]), "");
        assert_eq!(c.pending_len(), 1);
        assert_eq!(c.push(&emoji[1..2]), "");
        assert_eq!(c.push(&emoji[2..3]), "");
        assert_eq!(c.push(&emoji[3..]), "🍉");
        assert_eq!(c.pending_len(), 0);
    }

    #[test]
    fn splits_a_two_byte_cyrillic_letter() {
        let letter = "Д".as_bytes(); // D0 94
        let mut c = Utf8Chunker::default();
        assert_eq!(c.push(&letter[..1]), "");
        assert_eq!(c.pending_len(), 1);
        assert_eq!(c.push(&letter[1..]), "Д");
    }

    #[test]
    fn a_truncated_lead_byte_followed_by_ascii_is_invalid_not_pending() {
        let mut c = Utf8Chunker::default();
        assert_eq!(c.push(&[0xD0]), "");
        assert_eq!(c.push(b"one"), "\u{FFFD}one");
    }

    #[test]
    fn keeps_text_around_a_split() {
        let mut c = Utf8Chunker::default();
        let full = "abДc".as_bytes();
        assert_eq!(c.push(&full[..3]), "ab");
        assert_eq!(c.push(&full[3..]), "Дc");
    }

    #[test]
    fn invalid_bytes_become_replacement_chars() {
        let mut c = Utf8Chunker::default();
        assert_eq!(c.push(b"a\xffb"), "a\u{FFFD}b");
        assert_eq!(c.push(b"\x80\x81"), "\u{FFFD}\u{FFFD}");
        assert_eq!(c.pending_len(), 0);
    }

    #[test]
    fn invalid_byte_after_a_pending_prefix() {
        // A truncated sequence followed by junk: the prefix cannot be rescued,
        // the junk still decodes.
        let mut c = Utf8Chunker::default();
        assert_eq!(c.push(&[0xD0]), "");
        assert_eq!(c.push(&[0xFF, b'x']), "\u{FFFD}\u{FFFD}x");
    }
}
