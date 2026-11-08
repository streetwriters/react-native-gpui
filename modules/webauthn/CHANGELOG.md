# Changelog

All notable changes to `@react-native-gpui/webauthn` are listed here. Each version's section becomes the notes of its GitHub release.

## Unreleased

- First version: resident credential creation with PIN verification and the PRF (hmac-secret) extension over CTAP2 on USB HID, with ES256 and RS256 offered. The transport is a trait, so the CTAP2 flow is tested against a software authenticator; `installSoftAuthenticator` injects it in debug builds. Real USB keys are unverified.
