use chrono::{Datelike, Utc};
use hmac::{Hmac, Mac};
use rand::Rng;
use sha2::Sha256;

pub fn luhn_checksum_digit(number_without_check: &str) -> u8 {
    let mut sum = 0u32;
    let mut double = true;

    for ch in number_without_check.chars().rev() {
        let mut digit = ch.to_digit(10).unwrap_or(0);
        if double {
            digit *= 2;
            if digit > 9 {
                digit -= 9;
            }
        }
        sum += digit;
        double = !double;
    }

    ((10 - (sum % 10)) % 10) as u8
}

pub fn passes_luhn(card: &str) -> bool {
    if card.len() != 16 || !card.chars().all(|c| c.is_ascii_digit()) {
        return false;
    }

    let mut sum = 0u32;
    let mut double = false;
    for ch in card.chars().rev() {
        let mut digit = ch.to_digit(10).unwrap_or(0);
        if double {
            digit *= 2;
            if digit > 9 {
                digit -= 9;
            }
        }
        sum += digit;
        double = !double;
    }

    sum % 10 == 0
}

pub fn generate_card_number(bank_code: &str) -> String {
    let mut rng = rand::thread_rng();
    let three_random = format!("{:03}", rng.gen_range(0..1000));
    let mut body = format!("4{}{}", bank_code, three_random);

    while body.len() < 15 {
        body.push(char::from(b'0' + rng.gen_range(0..10) as u8));
    }

    let check = luhn_checksum_digit(&body);
    format!("{}{}", body, check)
}

pub fn format_card_display(card_number: &str) -> String {
    card_number
        .chars()
        .collect::<Vec<_>>()
        .chunks(4)
        .map(|chunk| chunk.iter().collect::<String>())
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn generate_expiry() -> (String, String) {
    let now = Utc::now();
    let month = format!("{:02}", now.month());
    let year = format!("{}", now.year() + 4);
    (month, year)
}

pub fn generate_cvv(card_number: &str, expiry_month: &str, expiry_year: &str, secret: &str) -> String {
    type HmacSha256 = Hmac<Sha256>;

    let payload = format!("{}{}{}", card_number, expiry_month, expiry_year);
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).expect("HMAC can use any key size");
    mac.update(payload.as_bytes());
    let digest = mac.finalize().into_bytes();

    let mut digits = String::new();
    for b in digest {
        digits.push_str(&(b % 10).to_string());
        if digits.len() >= 3 {
            break;
        }
    }

    while digits.len() < 3 {
        digits.push('0');
    }

    digits
}

pub fn generate_account_number() -> String {
    let mut rng = rand::thread_rng();
    let mut out = String::with_capacity(20);
    for _ in 0..20 {
        out.push(char::from(b'0' + rng.gen_range(0..10) as u8));
    }
    out
}

pub fn compute_rib_control_key(bank_code: &str, branch_code: &str, account_13: &str) -> u8 {
    let bb: i128 = bank_code.parse().unwrap_or(0);
    let ccc: i128 = branch_code.parse().unwrap_or(0);
    let account: i128 = account_13.parse().unwrap_or(0);
    let modulo = (89 * bb + 15 * ccc + 3 * account) % 97;
    (97 - modulo) as u8
}

pub fn generate_rib(bank_code: &str, branch_code: &str) -> (String, String) {
    let mut rng = rand::thread_rng();
    let account_13 = format!("{:013}", rng.gen_range(0..10_000_000_000_000u64));
    let control = compute_rib_control_key(bank_code, branch_code, &account_13);
    let rib = format!("{}{}{}{:02}", bank_code, branch_code, account_13, control);
    (rib, account_13)
}

pub fn generate_iban(rib: &str) -> String {
    format!("TN59{}", rib)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn card_number_passes_luhn() {
        let card = generate_card_number("99");
        assert_eq!(card.len(), 16);
        assert!(passes_luhn(&card));
    }

    #[test]
    fn rib_and_iban_format() {
        let (rib, account_13) = generate_rib("99", "000");
        assert_eq!(account_13.len(), 13);
        assert_eq!(rib.len(), 20);
        assert!(rib.chars().all(|c| c.is_ascii_digit()));
        let iban = generate_iban(&rib);
        assert_eq!(iban.len(), 24);
        assert!(iban.starts_with("TN59"));
    }

    #[test]
    fn expiry_format() {
        let (mm, yyyy) = generate_expiry();
        assert_eq!(mm.len(), 2);
        assert_eq!(yyyy.len(), 4);
    }
}
