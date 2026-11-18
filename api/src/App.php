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
            ['GET', '/groups', [GroupHandlers::class, 'list'], 'user'],
            ['PATCH', '/groups/{id}', [GroupHandlers::class, 'patch'], 'user'],
            ['POST', '/players', [GroupHandlers::class, 'addPlayer'], 'user'],
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
