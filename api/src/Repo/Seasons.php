<?php
declare(strict_types=1);

/** Seasons of a group: reads the season state and validates/applies admin changes. */
final class Seasons
{
    private static function invalid(string $reason): ApiError
    {
        return new ApiError(422, 'validation_failed', 'Ongeldige invoer: ' . $reason);
    }

    /** @return array{first_season_name:?string, seasons:array<int,array{id:int,name:?string,starts_at:string}>} */
    public static function state(PDO $pdo, int $groupId): array
    {
        $st = $pdo->prepare('SELECT first_season_name FROM game_groups WHERE id = ?');
        $st->execute([$groupId]);
        $first = $st->fetchColumn();

        $st = $pdo->prepare('SELECT id, name, starts_at FROM seasons WHERE group_id = ? ORDER BY starts_at, id');
        $st->execute([$groupId]);
        return [
            'first_season_name' => $first === false ? null : $first,
            'seasons' => array_map(fn(array $r) => [
                'id' => (int)$r['id'],
                'name' => $r['name'],
                'starts_at' => Groups::iso($r['starts_at']),
            ], $st->fetchAll()),
        ];
    }

    /** Trims; null or "" resets to the default (null). */
    public static function cleanName(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }
        if (!is_string($value)) {
            throw self::invalid('naam moet tekst zijn.');
        }
        $name = trim($value);
        if ($name === '') {
            return null;
        }
        if (mb_strlen($name, 'UTF-8') > 40) {
            throw self::invalid('naam mag maximaal 40 tekens zijn.');
        }
        return $name;
    }

    /** ISO with offset to a UTC "Y-m-d H:i:s" string; never later than now + 5 minutes. */
    public static function cleanStart(mixed $value): string
    {
        try {
            $utc = Validate::parseStartedAt($value);
        } catch (ApiError) {
            throw self::invalid('ongeldige startdatum.');
        }
        $limit = (new DateTimeImmutable('now', new DateTimeZone('UTC')))->modify('+5 minutes')->format('Y-m-d H:i:s');
        if ($utc > $limit) {
            throw self::invalid('startdatum mag niet in de toekomst liggen.');
        }
        return $utc;
    }

    public static function nowUtc(): string
    {
        return (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d H:i:s');
    }

    /** Locks the group row so concurrent season changes in one group run one at a time. */
    public static function lockGroup(PDO $pdo, int $groupId): bool
    {
        $st = $pdo->prepare('SELECT 1 FROM game_groups WHERE id = ? FOR UPDATE');
        $st->execute([$groupId]);
        return $st->fetchColumn() !== false;
    }

    /** Latest start of the group, or null without seasons. */
    public static function latestStart(PDO $pdo, int $groupId): ?string
    {
        $st = $pdo->prepare('SELECT MAX(starts_at) FROM seasons WHERE group_id = ?');
        $st->execute([$groupId]);
        $v = $st->fetchColumn();
        return $v === false || $v === null ? null : $v;
    }

    public static function add(PDO $pdo, int $groupId, ?string $name, string $startsAt): void
    {
        $latest = self::latestStart($pdo, $groupId);
        if ($latest !== null && $startsAt <= $latest) {
            throw self::invalid('startdatum moet na het vorige seizoen liggen.');
        }
        $pdo->prepare('INSERT INTO seasons (group_id, name, starts_at) VALUES (?, ?, ?)')
            ->execute([$groupId, $name, $startsAt]);
    }

    /** Moves a season's start; it must stay strictly between its neighbours' starts. */
    public static function moveStart(PDO $pdo, int $seasonId, int $groupId, string $startsAt): void
    {
        $st = $pdo->prepare('SELECT MAX(starts_at) FROM seasons WHERE group_id = ? AND id <> ? AND starts_at < (SELECT starts_at FROM seasons WHERE id = ?)');
        $st->execute([$groupId, $seasonId, $seasonId]);
        $prev = $st->fetchColumn();
        $st = $pdo->prepare('SELECT MIN(starts_at) FROM seasons WHERE group_id = ? AND id <> ? AND starts_at > (SELECT starts_at FROM seasons WHERE id = ?)');
        $st->execute([$groupId, $seasonId, $seasonId]);
        $next = $st->fetchColumn();
        if (($prev !== false && $prev !== null && $startsAt <= $prev) || ($next !== false && $next !== null && $startsAt >= $next)) {
            throw self::invalid('startdatum moet tussen het vorige en het volgende seizoen liggen.');
        }
        $pdo->prepare('UPDATE seasons SET starts_at = ? WHERE id = ?')->execute([$startsAt, $seasonId]);
    }
}
