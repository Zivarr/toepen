<?php
declare(strict_types=1);

/** One-time links (invite or reset) that let a user set their password. Only a hash of the code is stored. */
final class PasswordLinks
{
    public const TTL_HOURS = 48;

    /**
     * Invalidates the user's unused links and creates a new one. Run inside the caller's transaction if any.
     * @return array{code:string, purpose:string, expires_at:string}
     */
    public static function create(PDO $pdo, int $userId, string $purpose): array
    {
        $pdo->prepare('UPDATE password_links SET used_at = UTC_TIMESTAMP() WHERE user_id = ? AND used_at IS NULL')
            ->execute([$userId]);
        $code = bin2hex(random_bytes(32));
        $pdo->prepare(
            'INSERT INTO password_links (user_id, token_hash, purpose, expires_at)
             VALUES (?, ?, ?, UTC_TIMESTAMP() + INTERVAL ' . self::TTL_HOURS . ' HOUR)'
        )->execute([$userId, hash('sha256', $code), $purpose]);
        $st = $pdo->prepare('SELECT expires_at FROM password_links WHERE id = ?');
        $st->execute([(int)$pdo->lastInsertId()]);
        return ['code' => $code, 'purpose' => $purpose, 'expires_at' => Groups::iso((string)$st->fetchColumn())];
    }

    /**
     * A usable link (unused, not expired, user not disabled) with its user, or null.
     * @return array{link_id:int, user_id:int, username:string, purpose:string, expires_at:string}|null
     */
    public static function find(PDO $pdo, string $code): ?array
    {
        if (!preg_match('/^[0-9a-f]{64}$/D', $code)) {
            return null;
        }
        $st = $pdo->prepare(
            'SELECT l.id, l.user_id, u.username, l.purpose, l.expires_at
             FROM password_links l JOIN users u ON u.id = l.user_id
             WHERE l.token_hash = ? AND l.used_at IS NULL AND l.expires_at > UTC_TIMESTAMP()
               AND u.disabled_at IS NULL'
        );
        $st->execute([hash('sha256', $code)]);
        $row = $st->fetch();
        if (!$row) {
            return null;
        }
        return [
            'link_id' => (int)$row['id'],
            'user_id' => (int)$row['user_id'],
            'username' => $row['username'],
            'purpose' => $row['purpose'],
            'expires_at' => Groups::iso($row['expires_at']),
        ];
    }

    /** Marks the link used; false when it was already used (e.g. a double submit). */
    public static function markUsed(PDO $pdo, int $linkId): bool
    {
        $st = $pdo->prepare('UPDATE password_links SET used_at = UTC_TIMESTAMP() WHERE id = ? AND used_at IS NULL');
        $st->execute([$linkId]);
        return $st->rowCount() === 1;
    }
}
