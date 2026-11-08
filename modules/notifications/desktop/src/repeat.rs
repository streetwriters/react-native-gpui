use chrono::{DateTime, Days, Local, Months, TimeZone};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Repeat {
    Hourly,
    Daily,
    Weekly,
    Monthly,
}

impl Repeat {
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "hourly" => Some(Self::Hourly),
            "daily" => Some(Self::Daily),
            "weekly" => Some(Self::Weekly),
            "monthly" => Some(Self::Monthly),
            _ => None,
        }
    }
}

fn local(millis: i64) -> Option<DateTime<Local>> {
    Local.timestamp_millis_opt(millis).single()
}

/// The `n`th occurrence of `repeat`, counted from `first` in local time so a
/// daily reminder keeps its wall-clock hour across daylight saving changes and
/// a monthly one keeps its day of the month without drifting after a short month.
fn occurrence(first: DateTime<Local>, repeat: Repeat, n: u64) -> Option<i64> {
    let at = match repeat {
        Repeat::Hourly => return Some(first.timestamp_millis() + (n as i64) * 3_600_000),
        Repeat::Daily => first.checked_add_days(Days::new(n))?,
        Repeat::Weekly => first.checked_add_days(Days::new(n.checked_mul(7)?))?,
        Repeat::Monthly => first.checked_add_months(Months::new(u32::try_from(n).ok()?))?,
    };
    Some(at.timestamp_millis())
}

/// The first time after `now` at which a notification starting at `first` fires.
/// Without a repeat that is `first` itself, or nothing once it has passed.
pub fn next_fire(first: i64, repeat: Option<Repeat>, now: i64) -> Option<i64> {
    let Some(repeat) = repeat else {
        return (first > now).then_some(first);
    };
    if first > now {
        return Some(first);
    }
    let start = local(first)?;
    let approximate_period = match repeat {
        Repeat::Hourly => 3_600_000,
        Repeat::Daily => 86_400_000,
        Repeat::Weekly => 7 * 86_400_000,
        Repeat::Monthly => 28 * 86_400_000,
    };
    let mut n = ((now - first) / approximate_period).max(1) as u64 - 1;
    loop {
        let at = occurrence(start, repeat, n)?;
        if at > now {
            return Some(at);
        }
        n += 1;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(year: i32, month: u32, day: u32, hour: u32) -> i64 {
        Local
            .with_ymd_and_hms(year, month, day, hour, 0, 0)
            .unwrap()
            .timestamp_millis()
    }

    #[test]
    fn one_shot_only_fires_in_the_future() {
        assert_eq!(next_fire(100, None, 50), Some(100));
        assert_eq!(next_fire(100, None, 100), None);
    }

    #[test]
    fn daily_keeps_the_hour() {
        let next = next_fire(at(2026, 1, 1, 9), Some(Repeat::Daily), at(2026, 6, 10, 9));
        assert_eq!(next, Some(at(2026, 6, 11, 9)));
    }

    #[test]
    fn weekly_keeps_the_weekday() {
        let next = next_fire(at(2026, 1, 5, 8), Some(Repeat::Weekly), at(2026, 1, 13, 0));
        assert_eq!(next, Some(at(2026, 1, 19, 8)));
    }

    #[test]
    fn monthly_does_not_drift_after_a_short_month() {
        let first = at(2026, 1, 31, 7);
        assert_eq!(
            next_fire(first, Some(Repeat::Monthly), at(2026, 2, 1, 0)),
            Some(at(2026, 2, 28, 7))
        );
        assert_eq!(
            next_fire(first, Some(Repeat::Monthly), at(2026, 3, 1, 0)),
            Some(at(2026, 3, 31, 7))
        );
    }

    #[test]
    fn hourly_steps_by_the_hour() {
        let next = next_fire(1_000, Some(Repeat::Hourly), 1_000 + 3 * 3_600_000 + 5);
        assert_eq!(next, Some(1_000 + 4 * 3_600_000));
    }
}
