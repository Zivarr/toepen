<?php
declare(strict_types=1);

/** Input validation shared by POST /games and sync requests. */
final class Validate
{
    private static function fail(string $reason): never
    {
        throw new ApiError(422, 'validation_failed', 'Ongeldig spel: ' . $reason . '.');
    }

    /**
     * Validates and normalises a GameUpload.
     *
     * @return array{id:string, group_id:?int, started_at:string, duration_ms:int, max_penalty_points:int,
     *               ended_early:bool, winner:?string, players:array<int,array{name:string,final_score:int,boer_count:int}>}
     *         started_at is returned as a UTC "Y-m-d H:i:s" string, ready for the database.
     */
    public static function gameUpload(array $g, bool $requireGroupId = true): array
    {
        $groupId = null;
        if ($requireGroupId) {
            if (!is_int($g['group_id'] ?? null)) {
                self::fail('groep ontbreekt');
            }
            $groupId = $g['group_id'];
        }

        $id = $g['id'] ?? null;
        if (!is_string($id) || !preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $id)) {
            self::fail('ongeldig spel-id');
        }

        $max = $g['max_penalty_points'] ?? null;
        if (!is_int($max) || $max < 1 || $max > 100) {
            self::fail('strafpunten-limiet moet tussen 1 en 100 liggen');
        }

        $duration = $g['duration_ms'] ?? null;
        if (!is_int($duration) || $duration < 0) {
            self::fail('ongeldige speelduur');
        }

        $endedEarly = $g['ended_early'] ?? false;
        if (!is_bool($endedEarly)) {
            self::fail('ongeldige waarde voor voortijdig beëindigd');
        }

        $startedAt = self::parseStartedAt($g['started_at'] ?? null);

        $rawPlayers = $g['players'] ?? null;
        if (!is_array($rawPlayers) || !array_is_list($rawPlayers)) {
            self::fail('spelers ontbreken');
        }
        $count = count($rawPlayers);
        if ($count < 2 || $count > 8) {
            self::fail('een spel heeft 2 tot 8 spelers');
        }

        $players = [];
        $seen = [];
        $anitas = 0;
        foreach ($rawPlayers as $p) {
            if (!is_array($p) || !is_string($p['name'] ?? null)) {
                self::fail('ongeldige speler');
            }
            $name = Names::titleCase($p['name']);
            $len = mb_strlen($name, 'UTF-8');
            if ($len < 1 || $len > 40) {
                self::fail('spelersnaam moet 1 tot 40 tekens zijn');
            }
            $key = Names::normalise($name);
            if (isset($seen[$key])) {
                self::fail('dubbele spelersnaam');
            }
            $seen[$key] = true;

            $score = $p['final_score'] ?? null;
            if (!is_int($score) || $score < 0 || $score > $max) {
                self::fail('score moet tussen 0 en het maximum liggen');
            }
            $boer = $p['boer_count'] ?? 0;
            if (!is_int($boer) || $boer < 0) {
                self::fail('ongeldig aantal boeren');
            }
            $anita = $p['is_anita'] ?? false;
            if (!is_bool($anita)) {
                self::fail('ongeldige anita');
            }
            if ($anita) {
                if (++$anitas > 1) {
                    self::fail('maar één anita per spel');
                }
                if ($score !== $max) {
                    self::fail('anita moet het maximum hebben');
                }
            }
            $players[] = ['name' => $name, 'final_score' => $score, 'boer_count' => $boer, 'is_anita' => $anita];
        }

        $winner = $g['winner'] ?? null;
        if ($winner !== null) {
            if (!is_string($winner)) {
                self::fail('ongeldige winnaar');
            }
            $winnerKey = Names::normalise($winner);
            if (!isset($seen[$winnerKey])) {
                self::fail('winnaar speelt niet mee');
            }
            foreach ($players as $p) {
                if (Names::normalise($p['name']) === $winnerKey) {
                    $winner = $p['name'];
                    break;
                }
            }
            if ($endedEarly) {
                self::fail('een voortijdig beëindigd spel heeft geen winnaar');
            }
        }

        return [
            'id' => strtolower($id),
            'group_id' => $groupId,
            'started_at' => $startedAt,
            'duration_ms' => $duration,
            'max_penalty_points' => $max,
            'ended_early' => $endedEarly,
            'winner' => $winner,
            'players' => $players,
        ];
    }

    /** ISO 8601 with a mandatory offset (or Z) to UTC "Y-m-d H:i:s". */
    private static function parseStartedAt(mixed $value): string
    {
        $re = '/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:?\d{2})$/i';
        if (!is_string($value) || !preg_match($re, $value)) {
            self::fail('ongeldige starttijd');
        }
        try {
            $dt = new DateTimeImmutable($value, new DateTimeZone('UTC'));
        } catch (Exception) {
            self::fail('ongeldige starttijd');
        }
        $errors = DateTimeImmutable::getLastErrors();
        if ($errors !== false && ($errors['warning_count'] > 0 || $errors['error_count'] > 0)) {
            self::fail('ongeldige starttijd');
        }
        return $dt->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
    }
}
