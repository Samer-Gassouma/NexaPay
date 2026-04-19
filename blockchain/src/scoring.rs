pub trait DatabaseScoring {
    fn get_tx_count(&self, address: &str) -> u64;
    fn get_account_age_days(&self, address: &str) -> u64;
    fn get_balance(&self, address: &str) -> u64;
    fn has_repaid_loan(&self, address: &str) -> bool;
}

pub fn score_account(address: &str, db: &dyn DatabaseScoring) -> u8 {
    let mut score: i32 = 40;

    let tx_count = db.get_tx_count(address);
    let account_age_days = db.get_account_age_days(address);
    let balance = db.get_balance(address);
    let has_repaid_loan = db.has_repaid_loan(address);

    score += i32::min((tx_count as i32) * 2, 30);
    score += i32::min(account_age_days as i32, 15);

    if balance > 10_000_000 {
        score += 10;
    } else if balance > 1_000_000 {
        score += 7;
    } else if balance > 100_000 {
        score += 4;
    } else if balance > 0 {
        score += 2;
    }

    if has_repaid_loan {
        score += 5;
    }

    i32::min(score, 100) as u8
}

pub fn score_to_limit(score: u8) -> u64 {
    match score {
        90..=100 => 5_000_000,
        80..=89 => 2_000_000,
        70..=79 => 1_000_000,
        60..=69 => 500_000,
        _ => 0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct MockDb;

    impl DatabaseScoring for MockDb {
        fn get_tx_count(&self, _address: &str) -> u64 {
            10
        }

        fn get_account_age_days(&self, _address: &str) -> u64 {
            20
        }

        fn get_balance(&self, _address: &str) -> u64 {
            2_000_000
        }

        fn has_repaid_loan(&self, _address: &str) -> bool {
            true
        }
    }

    #[test]
    fn test_score_range() {
        let score = score_account("NXP123", &MockDb);
        assert!((40..=100).contains(&score));
    }

    #[test]
    fn test_limit_mapping() {
        assert_eq!(score_to_limit(95), 5_000_000);
        assert_eq!(score_to_limit(85), 2_000_000);
        assert_eq!(score_to_limit(72), 1_000_000);
        assert_eq!(score_to_limit(65), 500_000);
        assert_eq!(score_to_limit(40), 0);
    }
}
