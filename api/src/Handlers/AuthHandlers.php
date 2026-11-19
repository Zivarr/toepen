<?php
declare(strict_types=1);

final class AuthHandlers
{
    public static function userShape(array $u): array
    {
        return ['id' => (int)$u['id'], 'username' => $u['username'], 'is_admin' => (bool)$u['is_admin']];
    }

    public static function login(Request $req, Ctx $ctx, array $params): Response
    {
        $body = $req->json ?? [];
        $username = trim((string)($body['username'] ?? ''));
        $password = (string)($body['password'] ?? '');
        $device = trim((string)($body['device_name'] ?? ''));
        $bad = new ApiError(401, 'invalid_credentials', 'Gebruikersnaam of wachtwoord klopt niet.');

        if ($username === '' || $password === '') {
            throw $bad;
        }
        if (Auth::isRateLimited($ctx->pdo, $username)) {
            throw new ApiError(429, 'too_many_attempts', 'Te vaak geprobeerd. Probeer het over 15 minuten opnieuw.');
        }
        $st = $ctx->pdo->prepare('SELECT id, username, password_hash, is_admin, disabled_at FROM users WHERE username = ?');
        $st->execute([$username]);
        $user = $st->fetch();
        if (
            !$user || $user['disabled_at'] !== null || $user['password_hash'] === null
            || !password_verify($password, $user['password_hash'])
        ) {
            Auth::recordFailure($ctx->pdo, $username);
            throw $bad;
        }
        $token = Auth::issueToken($ctx->pdo, (int)$user['id'], $device);
        return new Response(200, ['token' => $token, 'user' => self::userShape($user)]);
    }

    public static function logout(Request $req, Ctx $ctx, array $params): Response
    {
        $ctx->pdo->prepare('UPDATE auth_tokens SET revoked_at = NOW() WHERE id = ?')->execute([$ctx->tokenId]);
        return new Response(204);
    }

    public static function me(Request $req, Ctx $ctx, array $params): Response
    {
        return new Response(200, ['user' => self::userShape($ctx->user)]);
    }

    private static function linkInvalid(): ApiError
    {
        return new ApiError(404, 'link_invalid', 'Deze link is verlopen of al gebruikt. Vraag de beheerder om een nieuwe.');
    }

    private static function requireNewPassword(mixed $password): string
    {
        if (!is_string($password) || mb_strlen($password, 'UTF-8') < 8) {
            throw new ApiError(422, 'validation_failed', 'Ongeldige invoer: wachtwoord moet minimaal 8 tekens zijn.');
        }
        return $password;
    }

    /** GET /password-links/{code} (no login) */
    public static function linkInfo(Request $req, Ctx $ctx, array $params): Response
    {
        $link = PasswordLinks::find($ctx->pdo, (string)$params['code']) ?? throw self::linkInvalid();
        return new Response(200, [
            'username' => $link['username'],
            'purpose' => $link['purpose'],
            'expires_at' => $link['expires_at'],
        ]);
    }

    /** POST /password-links/{code} (no login): sets the password and logs the user in. */
    public static function redeemLink(Request $req, Ctx $ctx, array $params): Response
    {
        $body = $req->json ?? [];
        $link = PasswordLinks::find($ctx->pdo, (string)$params['code']) ?? throw self::linkInvalid();
        $password = self::requireNewPassword($body['password'] ?? null); // checked before the link is spent
        $device = trim((string)($body['device_name'] ?? ''));
        $pdo = $ctx->pdo;

        $pdo->beginTransaction();
        try {
            if (!PasswordLinks::markUsed($pdo, $link['link_id'])) {
                throw self::linkInvalid();
            }
            $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?')
                ->execute([password_hash($password, PASSWORD_DEFAULT), $link['user_id']]);
            if ($link['purpose'] === 'reset') {
                $pdo->prepare('UPDATE auth_tokens SET revoked_at = UTC_TIMESTAMP() WHERE user_id = ? AND revoked_at IS NULL')
                    ->execute([$link['user_id']]);
            }
            $token = Auth::issueToken($pdo, $link['user_id'], $device);
            $pdo->commit();
        } catch (Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }

        $st = $pdo->prepare('SELECT id, username, is_admin FROM users WHERE id = ?');
        $st->execute([$link['user_id']]);
        return new Response(200, ['token' => $token, 'user' => self::userShape($st->fetch())]);
    }

    /** POST /me/password: change the own password; other devices stay logged in. */
    public static function changePassword(Request $req, Ctx $ctx, array $params): Response
    {
        $body = $req->json ?? [];
        $username = $ctx->user['username'];
        if (Auth::isRateLimited($ctx->pdo, $username)) {
            throw new ApiError(429, 'too_many_attempts', 'Te vaak geprobeerd. Probeer het over 15 minuten opnieuw.');
        }
        $st = $ctx->pdo->prepare('SELECT password_hash FROM users WHERE id = ?');
        $st->execute([$ctx->user['id']]);
        $hash = $st->fetchColumn();
        $current = (string)($body['current_password'] ?? '');
        if (!is_string($hash) || !password_verify($current, $hash)) {
            Auth::recordFailure($ctx->pdo, $username);
            throw new ApiError(403, 'wrong_password', 'Huidig wachtwoord klopt niet.');
        }
        $new = self::requireNewPassword($body['new_password'] ?? null);
        $ctx->pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?')
            ->execute([password_hash($new, PASSWORD_DEFAULT), $ctx->user['id']]);
        return new Response(204);
    }
}
