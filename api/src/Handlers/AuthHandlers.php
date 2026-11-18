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
        if (!$user || $user['disabled_at'] !== null || !password_verify($password, $user['password_hash'])) {
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
}
