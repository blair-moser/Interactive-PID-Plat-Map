CREATE TABLE `map_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`projects_json` text NOT NULL,
	`updated_at` text NOT NULL
);
