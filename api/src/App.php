<?php
declare(strict_types=1);

final class App
{
    /** @var array<int,array{0:string,1:string,2:callable,3:string}> test-only extra routes */
    public static array $extraRoutes = [];

    /** @return array<int,array{0:string,1:string,2:callable,3:string}> */
    private static function routes(): array
    {
        $routes = [
            ['POST', '/login', [AuthHandlers::class, 'login'], 'none'],
            ['POST', '/logout', [AuthHandlers::class, 'logout'], 'user'],
            ['GET', '/me', [AuthHandlers::class, 'me'], 'user'],
            ['POST', '/me/password', [AuthHandlers::class, 'changePassword'], 'user'],
            // The link code travels in the body, never in the path, so it stays out of access logs.
            ['POST', '/password-links/lookup', [AuthHandlers::class, 'linkInfo'], 'none'],
            ['POST', '/password-links/redeem', [AuthHandlers::class, 'redeemLink'], 'none'],
            ['GET', '/groups', [GroupHandlers::class, 'list'], 'user'],
            ['PATCH', '/groups/{id}', [GroupHandlers::class, 'patch'], 'user'],
            ['POST', '/players', [GroupHandlers::class, 'addPlayer'], 'user'],
            ['POST', '/games', [GameHandlers::class, 'upload'], 'user'],
            ['DELETE', '/games/{id}', [GameHandlers::class, 'delete'], 'user'],
            ['POST', '/sync-requests', [SyncHandlers::class, 'create'], 'user'],
            ['GET', '/sync-requests/mine', [SyncHandlers::class, 'mine'], 'user'],
            ['GET', '/admin/sync-requests', [SyncHandlers::class, 'adminList'], 'admin'],
            ['GET', '/admin/sync-requests/{id}/matching', [SyncHandlers::class, 'matching'], 'admin'],
            ['POST', '/admin/sync-requests/{id}/approve', [SyncHandlers::class, 'approve'], 'admin'],
            ['POST', '/admin/sync-requests/{id}/reject', [SyncHandlers::class, 'reject'], 'admin'],
            ['GET', '/admin/users', [AdminHandlers::class, 'listUsers'], 'admin'],
            ['POST', '/admin/users', [AdminHandlers::class, 'createUser'], 'admin'],
            ['PATCH', '/admin/users/{id}', [AdminHandlers::class, 'patchUser'], 'admin'],
            ['POST', '/admin/users/{id}/revoke-tokens', [AdminHandlers::class, 'revokeTokens'], 'admin'],
            ['POST', '/admin/users/{id}/password-link', [AdminHandlers::class, 'passwordLink'], 'admin'],
            ['GET', '/admin/groups', [AdminHandlers::class, 'listGroups'], 'admin'],
            ['POST', '/admin/groups/merge', [AdminHandlers::class, 'mergeGroups'], 'admin'],
            ['POST', '/admin/groups/{id}/members', [AdminHandlers::class, 'addMember'], 'admin'],
            ['DELETE', '/admin/groups/{id}/members/{user_id}', [AdminHandlers::class, 'removeMember'], 'admin'],
            ['POST', '/admin/groups/{id}/delete-games', [AdminHandlers::class, 'deleteGames'], 'admin'],
            ['POST', '/admin/groups/{id}/seasons', [SeasonHandlers::class, 'start'], 'admin'],
            ['PATCH', '/admin/groups/{id}/first-season', [SeasonHandlers::class, 'renameFirst'], 'admin'],
            ['PATCH', '/admin/seasons/{id}', [SeasonHandlers::class, 'patch'], 'admin'],
            ['DELETE', '/admin/seasons/{id}', [SeasonHandlers::class, 'delete'], 'admin'],
            ['POST', '/admin/players/merge', [AdminHandlers::class, 'mergePlayers'], 'admin'],
            ['GET', '/admin/games/deleted', [AdminHandlers::class, 'deletedGames'], 'admin'],
            ['POST', '/admin/games/{id}/restore', [AdminHandlers::class, 'restoreGame'], 'admin'],
            ['GET', '/admin/export', [AdminHandlers::class, 'export'], 'admin'],
        ];
        return array_merge($routes, self::$extraRoutes);
    }

    public static function handle(Request $req, PDO $pdo): Response
    {
        try {
            return self::dispatch($req, $pdo);
        } catch (ApiError $e) {
            return self::errorResponse($e);
        } catch (Throwable $e) {
            error_log('Toepen API error: ' . $e::class . ': ' . $e->getMessage() . "\n" . $e->getTraceAsString());
            return new Response(500, [
                'error' => 'server_error',
                'message' => 'Er ging iets mis op de server.',
            ]);
        }
    }

    private static function dispatch(Request $req, PDO $pdo): Response
    {
        $path = '/' . trim($req->path, '/');
        $method = strtoupper($req->method);
        $pathMatched = false;

        foreach (self::routes() as [$routeMethod, $pattern, $handler, $auth]) {
            $params = self::match($pattern, $path);
            if ($params === null) {
                continue;
            }
            $pathMatched = true;
            if (strtoupper($routeMethod) !== $method) {
                continue;
            }
            $ctx = self::authenticate($req, $pdo, $auth);
            return $handler($req, $ctx, $params);
        }

        if ($pathMatched) {
            throw new ApiError(405, 'method_not_allowed', 'Deze methode is niet toegestaan.');
        }
        throw new ApiError(404, 'not_found', 'Niet gevonden.');
    }

    /** @return array<string,string>|null */
    private static function match(string $pattern, string $path): ?array
    {
        $regex = preg_replace('#\{(\w+)\}#', '(?P<$1>[^/]+)', $pattern);
        if (!preg_match('#^' . $regex . '$#', $path, $m)) {
            return null;
        }
        $params = [];
        foreach ($m as $k => $v) {
            if (is_string($k)) {
                $params[$k] = urldecode($v);
            }
        }
        return $params;
    }

        private static function authenticate(Request $req, PDO $pdo, string $auth): Ctx
    {
        if ($auth === 'none') {
            return new Ctx($pdo);
        }
        $token = Auth::tokenFromRequest($req);
        $user = $token !== null ? Auth::userForToken($pdo, $token) : null;
        if ($user === null) {
            throw new ApiError(401, 'unauthorized', 'Log opnieuw in.');
        }
        if ($auth === 'admin' && !$user['is_admin']) {
            throw new ApiError(403, 'admin_only', 'Alleen voor beheerders.');
        }
        $tokenId = $user['token_id'];
        unset($user['token_id']);
        return new Ctx($pdo, $user, $tokenId);
    }


    private static function errorResponse(ApiError $e): Response
    {
        $body = ['error' => $e->errorCode, 'message' => $e->getMessage()];
        if ($e->extra !== null) {
            $body = array_merge($body, $e->extra);
        }
        return new Response($e->status, $body);
    }
}
