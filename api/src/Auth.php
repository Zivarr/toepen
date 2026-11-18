<?php
declare(strict_types=1);

/** Per-request context handed to handlers. */
final class Ctx
{
    /** @param array{id:int,username:string,is_admin:bool}|null $user */
    public function __construct(
        public PDO $pdo,
        public ?array $user = null,
        public ?int $tokenId = null,
    ) {
    }
}

final class Auth
{
    public const MAX_FAILED_ATTEMPTS = 5;
    public const WINDOW_MINUTES = 15;

    public static function issueToken(PDO $pdo, int $userId, string $deviceName): string
    {
        $token = bin2hex(random_bytes(32));
        $st = $pdo->prepare('INSERT INTO auth_tokens (user_id, token_hash, device_name) VALUES (?, ?, ?)');
        $st->execute([$userId, hash('sha256', $token), mb_substr($deviceName, 0, 100)]);
        return $token;
    }

    /** @return array{id:int,username:string,is_admin:bool,token_id:int}|null */
    public static function userForToken(PDO $pdo, string $token): ?array
    {
        $st = $pdo->prepare(
            'SELECT t.id AS token_id, u.id, u.username, u.is_admin
             FROM auth_tokens t JOIN users u ON u.id = t.user_id
             WHERE t.token_hash = ? AND t.revoked_at IS NULL AND u.disabled_at IS NULL'
        );
        $st->execute([hash('sha256', $token)]);
        $row = $st->fetch();
        if (!$row) {
            return null;
        }
        $pdo->prepare('UPDATE auth_tokens SET last_used_at = NOW() WHERE id = ?')->execute([$row['token_id']]);
        return [
            'id' => (int)$row['id'],
            'username' => $row['username'],
            'is_admin' => (bool)$row['is_admin'],
            'token_id' => (int)$row['token_id'],
        ];
    }

    public static function tokenFromRequest(Request $req): ?string
    {
        $h = $req->header('Authorization');
        if ($h !== null && preg_match('/^Bearer\s+(\S+)$/i', trim($h), $m)) {
            return $m[1];
        }
        $x = $req->header('X-Auth-Token');
        if ($x !== null && trim($x) !== '') {
            return trim($x);
        }
        return null;
    }

    public static function isRateLimited(PDO $pdo, string $username): bool
    {
        $st = $pdo->prepare(
            'SELECT COUNT(*) FROM login_attempts WHERE username = ? AND attempted_at > NOW() - INTERVAL ' . self::WINDOW_MINUTES . ' MINUTE'
        );
        $st->execute([$username]);
        return (int)$st->fetchColumn() >= self::MAX_FAILED_ATTEMPTS;
    }

    public static function recordFailure(PDO $pdo, string $username): void
    {
        $pdo->prepare('INSERT INTO login_attempts (username) VALUES (?)')->execute([mb_substr($username, 0, 60)]);
    }
}
