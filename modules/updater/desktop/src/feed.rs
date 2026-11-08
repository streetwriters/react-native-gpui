//! The release feed: the `latest-mac.yml` (or `<channel>-mac.yml`) file that
//! electron-builder publishes, so a feed that serves an Electron app serves this
//! one too.

use semver::Version;
use serde::Deserialize;
use url::Url;

#[derive(Deserialize)]
struct Feed {
    version: String,
    #[serde(default)]
    files: Vec<FeedFile>,
    path: Option<String>,
    sha512: Option<String>,
    #[serde(rename = "releaseDate")]
    release_date: Option<String>,
}

#[derive(Deserialize)]
struct FeedFile {
    url: String,
    sha512: Option<String>,
    size: Option<u64>,
}

/// The update a feed offers: one archive, with the digest to check it against.
#[derive(Clone, Debug, PartialEq)]
pub struct Release {
    pub version: Version,
    pub release_date: Option<String>,
    pub url: Url,
    pub sha512: String,
    pub size: u64,
}

fn parse_version(text: &str) -> Result<Version, String> {
    Version::parse(text.trim().trim_start_matches('v'))
        .map_err(|error| format!("\"{text}\" is not a version: {error}"))
}

/// The URL of the feed file for `channel`, inside `feed_url`.
pub fn feed_location(feed_url: &str, channel: &str) -> Result<Url, String> {
    let mut base = feed_url.trim().to_string();
    if !base.ends_with('/') {
        base.push('/');
    }
    let base = Url::parse(&base).map_err(|error| format!("the feed URL is not valid: {error}"))?;
    let channel = if channel.is_empty() {
        "latest"
    } else {
        channel
    };
    base.join(&format!("{channel}-mac.yml"))
        .map_err(|error| error.to_string())
}

pub fn parse(text: &str, location: &Url) -> Result<Release, String> {
    let feed: Feed =
        serde_yaml_ng::from_str(text).map_err(|error| format!("the feed is not valid: {error}"))?;
    let version = parse_version(&feed.version)?;
    let is_zip = |url: &str| url.to_ascii_lowercase().ends_with(".zip");

    let chosen = feed
        .files
        .iter()
        .find(|file| is_zip(&file.url))
        .map(|file| (file.url.clone(), file.sha512.clone(), file.size))
        .or_else(|| {
            feed.path
                .as_ref()
                .filter(|path| is_zip(path))
                .map(|path| (path.clone(), feed.sha512.clone(), None))
        })
        .ok_or_else(|| "the feed offers no .zip archive".to_string())?;
    let (file, sha512, size) = chosen;
    let sha512 = sha512.ok_or_else(|| "the feed has no sha512 for the archive".to_string())?;
    let url = location
        .join(&file)
        .map_err(|error| format!("the archive URL is not valid: {error}"))?;
    Ok(Release {
        version,
        release_date: feed.release_date,
        url,
        sha512,
        size: size.unwrap_or(0),
    })
}

/// Whether `offered` should be installed over `current`.
pub fn is_newer(offered: &Version, current: &Version, allow_downgrade: bool) -> bool {
    offered > current || (allow_downgrade && offered != current)
}

pub fn current_version(text: &str) -> Result<Version, String> {
    parse_version(text)
}

#[cfg(test)]
mod tests {
    use super::*;

    const FEED: &str = "version: 3.2.1-beta.2\nfiles:\n  - url: Notesnook-3.2.1-beta.2-mac.dmg\n    sha512: aaa\n    size: 5\n  - url: Notesnook%203.2.1-mac.zip\n    sha512: bbb\n    size: 1234\npath: Notesnook-3.2.1-mac.zip\nsha512: bbb\nreleaseDate: '2026-01-02T03:04:05.000Z'\n";

    fn location() -> Url {
        feed_location("https://example.com/api/v1/releases/darwin/beta", "beta").unwrap()
    }

    #[test]
    fn the_feed_file_is_named_after_the_channel() {
        assert_eq!(
            location().as_str(),
            "https://example.com/api/v1/releases/darwin/beta/beta-mac.yml"
        );
        assert_eq!(
            feed_location("https://example.com/feed/", "")
                .unwrap()
                .as_str(),
            "https://example.com/feed/latest-mac.yml"
        );
    }

    #[test]
    fn the_zip_is_chosen_and_resolved_against_the_feed() {
        let release = parse(FEED, &location()).unwrap();
        assert_eq!(release.version.to_string(), "3.2.1-beta.2");
        assert_eq!(release.sha512, "bbb");
        assert_eq!(release.size, 1234);
        assert_eq!(
            release.url.as_str(),
            "https://example.com/api/v1/releases/darwin/beta/Notesnook%203.2.1-mac.zip"
        );
    }

    #[test]
    fn a_feed_without_a_digest_is_refused() {
        let feed = "version: 1.0.0\nfiles:\n  - url: a.zip\n";
        assert!(parse(feed, &location()).is_err());
    }

    #[test]
    fn newer_versions_and_downgrades() {
        let old = Version::parse("1.0.0").unwrap();
        let new = Version::parse("1.1.0").unwrap();
        let pre = Version::parse("1.1.0-beta.1").unwrap();
        assert!(is_newer(&new, &old, false));
        assert!(!is_newer(&old, &new, false));
        assert!(is_newer(&old, &new, true));
        assert!(!is_newer(&new, &new, true));
        assert!(is_newer(&new, &pre, false));
        assert!(!is_newer(&pre, &new, false));
    }
}
