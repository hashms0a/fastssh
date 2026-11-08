//! One module per command group; the handlers themselves stay thin.
pub mod crypto;
pub mod library;
pub mod session;
pub mod sync;
pub mod system;

/// The library context for the current state: the host `gpg` binary plus the
/// passphrase the user unlocked the library with (Stage 10). A poisoned mutex
/// is not fatal here - the value inside is still valid.
pub(crate) fn crypto_ctx(state: &crate::AppState) -> crate::crypto::LibraryCrypto {
    let passphrase = state
        .passphrase
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();
    crate::crypto::ctx(&state.runner, passphrase)
}
