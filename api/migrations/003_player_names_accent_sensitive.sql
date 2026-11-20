-- Player names: still case-insensitive, now accent-sensitive (José and Jose, Strauß and Strauss are different players),
-- matching the name checks in the API, the PWA and the Android app. Safe on existing data: the new comparison is
-- stricter, so the unique key (group_id, name) cannot gain duplicates.
ALTER TABLE players MODIFY name VARCHAR(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_ci NOT NULL;
