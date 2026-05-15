<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-API-Key, Prefer, Range');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$configPath = __DIR__ . '/config.php';
if (!is_file($configPath)) {
    http_response_code(500);
    echo json_encode(['error' => 'Missing api/config.php'], JSON_UNESCAPED_UNICODE);
    exit;
}

$config = require $configPath;
$apiKey = (string)($config['api_key'] ?? '');
$incomingKey = $_SERVER['HTTP_X_API_KEY'] ?? '';
$auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
if (!$incomingKey && preg_match('/Bearer\s+(.+)/i', $auth, $m)) {
    $incomingKey = trim($m[1]);
}
if (!$apiKey || !hash_equals($apiKey, (string)$incomingKey)) {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized'], JSON_UNESCAPED_UNICODE);
    exit;
}

function respond($data, int $status = 200, array $headers = []): void {
    http_response_code($status);
    foreach ($headers as $name => $value) {
        header($name . ': ' . $value);
    }
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function readJsonBody(): array {
    $raw = file_get_contents('php://input') ?: '';
    if ($raw === '') return [];
    $decoded = json_decode($raw, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        respond(['error' => 'Invalid JSON body'], 400);
    }
    return is_array($decoded) ? $decoded : [];
}

function normalizePath(): array {
    $uriPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
    $scriptDir = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '')), '/');
    if ($scriptDir && strpos($uriPath, $scriptDir) === 0) {
        $uriPath = substr($uriPath, strlen($scriptDir));
    }
    $uriPath = trim($uriPath, '/');
    if ($uriPath === '' || $uriPath === 'index.php' || $uriPath === 'rest/v1') return [];
    if (strpos($uriPath, 'index.php/') === 0) $uriPath = substr($uriPath, 10);
    if (strpos($uriPath, 'rest/v1/') === 0) $uriPath = substr($uriPath, 8);
    return array_values(array_filter(explode('/', $uriPath), 'strlen'));
}

function db(array $config): PDO {
    $dsn = 'mysql:host=' . $config['db_host'] . ';dbname=' . $config['db_name'] . ';charset=utf8mb4';
    return new PDO($dsn, $config['db_user'], $config['db_pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
}

$tables = [
    'app_users' => ['pk' => 'username'],
    'draft_requests' => ['pk' => 'draft_id'],
    'requests' => ['pk' => 'request_id'],
    'attendees' => ['pk' => 'id', 'unique' => ['source_row_key']],
    'memos' => ['pk' => 'memo_id'],
    'trash_requests' => ['pk' => 'trash_id', 'unique' => ['source_row_key']],
    'request_counters' => ['pk' => 'year_be'],
    'approval_links' => ['pk' => 'token'],
    'app_settings' => ['pk' => '`key`'],
    'system_config' => ['pk' => '`key`'],
];
$jsonColumns = ['extra', 'value', 'expense_items', 'attendees'];
$boolColumns = ['used', 'was_rejected'];
$dateColumns = ['doc_date', 'start_date', 'end_date'];
$dateTimeColumns = [
    'timestamp_source', 'created_at_source', 'attended_at', 'created_at',
    'updated_at', 'used_at', 'expires_at', 'rejected_at', 'finalized_at',
    'last_updated_source', 'deleted_at'
];

function tableName(string $name, array $tables): string {
    if (!isset($tables[$name])) respond(['error' => 'Unknown table: ' . $name], 404);
    return $name;
}

function columnsFor(PDO $pdo, string $table): array {
    static $cache = [];
    if (isset($cache[$table])) return $cache[$table];
    $stmt = $pdo->query('DESCRIBE `' . $table . '`');
    $cols = [];
    foreach ($stmt->fetchAll() as $row) $cols[] = $row['Field'];
    return $cache[$table] = $cols;
}

function normalizeTemporalValue($value, bool $dateOnly) {
    if ($value === null || $value === '') return null;
    if ($value instanceof DateTimeInterface) {
        return $value->format($dateOnly ? 'Y-m-d' : 'Y-m-d H:i:s');
    }
    $raw = (string)$value;
    $ts = strtotime($raw);
    if ($ts === false) return $raw;
    return date($dateOnly ? 'Y-m-d' : 'Y-m-d H:i:s', $ts);
}

function normalizeValue(string $column, $value, array $jsonColumns, array $boolColumns, array $dateColumns, array $dateTimeColumns) {
    if ($value === '') return '';
    if (in_array($column, $jsonColumns, true)) {
        if ($value === null) return null;
        return is_string($value) ? $value : json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
    if (in_array($column, $boolColumns, true)) {
        if ($value === null || $value === '') return null;
        return ($value === true || $value === 1 || $value === '1' || $value === 'true') ? 1 : 0;
    }
    if (in_array($column, $dateColumns, true)) return normalizeTemporalValue($value, true);
    if (in_array($column, $dateTimeColumns, true)) return normalizeTemporalValue($value, false);
    return $value;
}

function decodeRow(array $row, array $jsonColumns, array $boolColumns): array {
    foreach ($row as $key => $value) {
        if (in_array($key, $jsonColumns, true) && is_string($value) && $value !== '') {
            $decoded = json_decode($value, true);
            if (json_last_error() === JSON_ERROR_NONE) $row[$key] = $decoded;
        }
        if (in_array($key, $boolColumns, true) && $value !== null) {
            $row[$key] = (bool)$value;
        }
    }
    return $row;
}

function parseFilter(string $key, string $rawValue, array &$params): ?string {
    if ($key === 'select' || $key === 'order' || $key === 'limit' || $key === 'offset') return null;
    if (!preg_match('/^([a-zA-Z0-9_]+)$/', $key)) return null;
    $param = ':p' . count($params);
    if (strpos($rawValue, 'eq.') === 0) {
        $params[$param] = substr($rawValue, 3);
        return "`$key` = $param";
    }
    if (strpos($rawValue, 'gte.') === 0) {
        $params[$param] = substr($rawValue, 4);
        return "`$key` >= $param";
    }
    if (strpos($rawValue, 'lte.') === 0) {
        $params[$param] = substr($rawValue, 4);
        return "`$key` <= $param";
    }
    if ($rawValue === 'not.is.null') return "`$key` IS NOT NULL";
    if (strpos($rawValue, 'in.') === 0) {
        $inside = trim(substr($rawValue, 3));
        $inside = trim($inside, '()');
        $decoded = json_decode('[' . $inside . ']', true);
        if (!is_array($decoded)) {
            $decoded = array_map('trim', explode(',', $inside));
        }
        $placeholders = [];
        foreach ($decoded as $value) {
            $ph = ':p' . count($params);
            $params[$ph] = trim((string)$value, "\"'");
            $placeholders[] = $ph;
        }
        return $placeholders ? "`$key` IN (" . implode(',', $placeholders) . ")" : '1=0';
    }
    return null;
}

function buildWhere(array $query, array &$params): string {
    $parts = [];
    foreach ($query as $key => $value) {
        if (is_array($value)) $value = end($value);
        $filter = parseFilter((string)$key, (string)$value, $params);
        if ($filter) $parts[] = $filter;
    }
    return $parts ? ' WHERE ' . implode(' AND ', $parts) : '';
}

function buildOrder(?string $raw): string {
    if (!$raw) return '';
    $parts = [];
    foreach (explode(',', $raw) as $item) {
        $segments = explode('.', trim($item));
        $col = $segments[0] ?? '';
        if (!preg_match('/^[a-zA-Z0-9_]+$/', $col)) continue;
        $dir = in_array('desc', $segments, true) ? 'DESC' : 'ASC';
        $parts[] = "`$col` $dir";
    }
    return $parts ? ' ORDER BY ' . implode(', ', $parts) : '';
}

try {
    $pdo = db($config);
    $parts = normalizePath();
    if (!$parts) respond(['ok' => true, 'service' => 'WNY Hosting API']);
    $table = tableName($parts[0], $tables);
    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

    if ($method === 'GET') {
        $params = [];
        $where = buildWhere($_GET, $params);
        $order = buildOrder($_GET['order'] ?? null);
        $limit = isset($_GET['limit']) ? max(1, min(5000, (int)$_GET['limit'])) : null;
        $offset = isset($_GET['offset']) ? max(0, (int)$_GET['offset']) : 0;
        $range = $_SERVER['HTTP_RANGE'] ?? '';
        if ($range && preg_match('/(\d+)-(\d+)/', $range, $m)) {
            $offset = (int)$m[1];
            $limit = (int)$m[2] - (int)$m[1] + 1;
        }
        if (!$limit) $limit = 1000;

        $countStmt = $pdo->prepare("SELECT COUNT(*) AS c FROM `$table`" . $where);
        $countStmt->execute($params);
        $total = (int)$countStmt->fetch()['c'];

        $sql = "SELECT * FROM `$table`" . $where . $order . " LIMIT " . (int)$limit . " OFFSET " . (int)$offset;
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $rows = array_map(fn($row) => decodeRow($row, $jsonColumns, $boolColumns), $stmt->fetchAll());
        $end = $offset + max(0, count($rows) - 1);
        respond($rows, 200, ['Content-Range' => $offset . '-' . $end . '/' . $total]);
    }

    if ($method === 'POST') {
        $rows = readJsonBody();
        if (!$rows) respond([], 200);
        if (array_keys($rows) !== range(0, count($rows) - 1)) $rows = [$rows];

        $columns = columnsFor($pdo, $table);
        $conflict = $_GET['on_conflict'] ?? ($tables[$table]['pk'] ?? '');
        $conflict = str_replace('`', '', (string)$conflict);
        if (!$conflict || !in_array($conflict, $columns, true)) respond(['error' => 'Invalid on_conflict'], 400);

        foreach ($rows as $row) {
            $filtered = [];
            foreach ($row as $key => $value) {
                if (in_array($key, $columns, true)) {
                    $filtered[$key] = normalizeValue($key, $value, $jsonColumns, $boolColumns, $dateColumns, $dateTimeColumns);
                }
            }
            if (!$filtered) continue;
            $colNames = array_keys($filtered);
            $placeholders = array_map(fn($c) => ':' . $c, $colNames);
            $updates = [];
            foreach ($colNames as $col) {
                if ($col === $conflict) continue;
                $updates[] = "`$col` = VALUES(`$col`)";
            }
            $sql = "INSERT INTO `$table` (`" . implode('`,`', $colNames) . "`) VALUES (" . implode(',', $placeholders) . ")";
            if ($updates) $sql .= " ON DUPLICATE KEY UPDATE " . implode(', ', $updates);
            $stmt = $pdo->prepare($sql);
            foreach ($filtered as $col => $value) $stmt->bindValue(':' . $col, $value);
            $stmt->execute();
        }
        respond([], 200);
    }

    if ($method === 'DELETE') {
        $params = [];
        $where = buildWhere($_GET, $params);
        if (!$where) respond(['error' => 'DELETE requires a filter'], 400);
        $stmt = $pdo->prepare("DELETE FROM `$table`" . $where);
        $stmt->execute($params);
        respond([], 200);
    }

    respond(['error' => 'Method not allowed'], 405);
} catch (Throwable $e) {
    respond(['error' => $e->getMessage()], 500);
}
