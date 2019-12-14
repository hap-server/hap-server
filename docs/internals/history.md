History database format
---

Historical data is stored in the `history` directory in the data directory as an SQLite database.

- data-1-0.sqlite
    - Contains historical data in the version 1.0 format. [See v1.0 format.](#v1-0)

### Database upgrades

If a database upgrade is necessary, hap-server will on start duplicate the database file with the new version number
and run a script to upgrade the database.

### v1.0

#### Tables

- `r`

    Contains history records.

    Name | Type      | Indexes                              | Comment
    -----|-----------|--------------------------------------|---------
    `i`  | `INTEGER` | `PRIMARY KEY`, `AUTOINCREMENT`       | Record ID
    `c`  | `INTEGER` | `NOT NULL`                           | Characteristic ID
    `v`  | `TEXT`    | `NOT NULL`                           | Characteristic value
    `u`  | `INTEGER` |                                      | User record ID
    `d`  | `TIMESTAMP` | `NOT NULL`                         | Timestamp

    `FOREIGN KEY (c) REFERENCES c (i) ON UPDATE RESTRICT ON DELETE RESTRICT`
    `FOREIGN KEY (u) REFERENCES u (i) ON UPDATE RESTRICT ON DELETE RESTRICT`

- `c`

    Maps characteristic record IDs to UUIDs.

    Name | Type      | Indexes                              | Comment
    -----|-----------|--------------------------------------|---------
    `i`  | `INTEGER` | `PRIMARY KEY`, `AUTOINCREMENT`       | Characteristic ID
    `a`  | `CHAR(36)` | `NOT NULL`                          | Accessory UUID
    `s`  | `CHAR(36)` | `NOT NULL`                          | Service UUID
    `t`  | `STRING`  |                                      | Service subtype
    `c`  | `CHAR(36)` | `NOT NULL`                          | Characteristic UUID

    `UNIQUE INDEX (a, s, t, c)`

- `u`

    Maps user record IDs to user data.

    Name | Type      | Indexes                              | Comment
    -----|-----------|--------------------------------------|---------
    `i`  | `INTEGER` | `PRIMARY KEY`, `AUTOINCREMENT`       | User record ID
    `t`  | `INTEGER` | `NOT NULL`                           | Type - either (0 - HAP pairing or 1 - hap-server user)
    `u`  | `STRING`  | `NOT NULL`                           | User/pairing ID
    `n`  | `STRING`  | `NOT NULL`                           | User display name

    `UNIQUE INDEX (t, u)`
