package common

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"os"
)

// DISTRIBUTOR_ACCOUNT_SECRET gates account-snapshot encryption for distributor
// payouts. The dedicated secret is stretched with SHA-256 (salted by purpose)
// and used as an AES-256-GCM key; when the variable is unset the payout path
// refuses to store account data at all.
const DistributorAccountSecretEnv = "DISTRIBUTOR_ACCOUNT_SECRET"

var ErrAccountCryptoSecretMissing = errors.New("DISTRIBUTOR_ACCOUNT_SECRET is not configured")

func accountCryptoKey() ([]byte, error) {
	secret := os.Getenv(DistributorAccountSecretEnv)
	if secret == "" {
		return nil, ErrAccountCryptoSecretMissing
	}
	sum := sha256.Sum256([]byte(secret + "|distributor-account-snapshot|v1"))
	return sum[:], nil
}

// EncryptAccountSnapshot returns base64(nonce || ciphertext) or an error when
// the dedicated secret is not configured.
func EncryptAccountSnapshot(plaintext []byte) (string, error) {
	key, err := accountCryptoKey()
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err = rand.Read(nonce); err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(gcm.Seal(nonce, nonce, plaintext, nil)), nil
}

func DecryptAccountSnapshot(encoded string) ([]byte, error) {
	key, err := accountCryptoKey()
	if err != nil {
		return nil, err
	}
	raw, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	if len(raw) < gcm.NonceSize() {
		return nil, errors.New("account snapshot ciphertext too short")
	}
	return gcm.Open(nil, raw[:gcm.NonceSize()], raw[gcm.NonceSize():], nil)
}
