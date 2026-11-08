use crate::ctap::{Authenticator, MakeRequest, PrfRequest, ALGORITHMS};
use crate::error::Error;
use crate::soft::SoftAuthenticator;
use crate::{crypto, ctap};

const RP: &str = "app.notesnook.com";
const USER: &[u8] = &[1, 2, 3, 4];

fn request<'a>() -> MakeRequest<'a> {
    MakeRequest {
        rp_id: RP,
        rp_name: "Notesnook",
        user_id: USER,
        user_name: "me",
        display_name: "Me",
    }
}

fn salt() -> Vec<u8> {
    vec![9; 32]
}

#[test]
fn registers_a_resident_credential_with_the_prf_enabled() {
    let soft = SoftAuthenticator::new("1234");
    let mut key = Authenticator::new(soft.clone()).unwrap();
    let mut states = Vec::new();
    let made = key
        .make_credential(&request(), Some("1234"), &mut |s| states.push(s))
        .unwrap();
    assert_eq!(made.credential_id.len(), 32);
    assert!(made.prf_enabled);
    assert_eq!(soft.credential_count(), 1);
    assert!(states.contains(&ctap::STATUS_TOUCH));
    assert_eq!(ALGORITHMS, [-7, -257]);
}

#[test]
fn the_same_secret_comes_back_from_the_same_credential_and_salt() {
    let soft = SoftAuthenticator::new("1234");
    let made = Authenticator::new(soft.clone())
        .unwrap()
        .make_credential(&request(), Some("1234"), &mut |_| {})
        .unwrap();
    let ask = |salt: &[u8]| {
        // A new connection each time, as a request opens one.
        Authenticator::new(soft.clone())
            .unwrap()
            .get_prf(
                &PrfRequest {
                    rp_id: RP,
                    credential_id: &made.credential_id,
                    salt,
                },
                Some("1234"),
                &mut |_| {},
            )
            .unwrap()
    };
    let first = ask(&salt());
    assert_eq!(first, ask(&salt()));
    assert_ne!(first, ask(&[7; 32]));
    assert_ne!(first, [0u8; 32]);
    assert_eq!(soft.touches(), 4);
}

#[test]
fn a_secret_is_what_the_authenticator_derives_from_the_prf_salt() {
    let soft = SoftAuthenticator::new("1234");
    let mut key = Authenticator::new(soft.clone()).unwrap();
    let made = key
        .make_credential(&request(), Some("1234"), &mut |_| {})
        .unwrap();
    let secret = key
        .get_prf(
            &PrfRequest {
                rp_id: RP,
                credential_id: &made.credential_id,
                salt: &salt(),
            },
            Some("1234"),
            &mut |_| {},
        )
        .unwrap();
    assert_eq!(
        secret,
        soft.expected_prf(&made.credential_id, &crypto::prf_salt(&salt()))
    );
}

#[test]
fn a_wrong_pin_says_how_many_tries_are_left() {
    let soft = SoftAuthenticator::new("1234");
    let mut key = Authenticator::new(soft).unwrap();
    let error = key
        .make_credential(&request(), Some("0000"), &mut |_| {})
        .unwrap_err();
    assert_eq!(error, Error::PinInvalid { retries: Some(7) });
}

#[test]
fn a_missing_pin_is_asked_for() {
    let mut key = Authenticator::new(SoftAuthenticator::new("1234")).unwrap();
    assert_eq!(
        key.make_credential(&request(), None, &mut |_| {})
            .unwrap_err(),
        Error::PinRequired
    );
}

#[test]
fn a_key_without_a_pin_or_without_hmac_secret_is_refused() {
    let mut key = Authenticator::new(SoftAuthenticator::without_pin()).unwrap();
    assert_eq!(
        key.make_credential(&request(), Some("1234"), &mut |_| {})
            .unwrap_err(),
        Error::PinNotSet
    );
    let mut key = Authenticator::new(SoftAuthenticator::without_hmac_secret("1234")).unwrap();
    assert!(matches!(
        key.make_credential(&request(), Some("1234"), &mut |_| {})
            .unwrap_err(),
        Error::Unsupported(_)
    ));
}

#[test]
fn an_unknown_credential_or_another_site_finds_nothing() {
    let soft = SoftAuthenticator::new("1234");
    let mut key = Authenticator::new(soft).unwrap();
    let made = key
        .make_credential(&request(), Some("1234"), &mut |_| {})
        .unwrap();
    let missing = key.get_prf(
        &PrfRequest {
            rp_id: RP,
            credential_id: &[5; 32],
            salt: &salt(),
        },
        Some("1234"),
        &mut |_| {},
    );
    assert_eq!(missing.unwrap_err(), Error::NoCredentials);
    let other_site = key.get_prf(
        &PrfRequest {
            rp_id: "example.com",
            credential_id: &made.credential_id,
            salt: &salt(),
        },
        Some("1234"),
        &mut |_| {},
    );
    assert_eq!(other_site.unwrap_err(), Error::NoCredentials);
}
