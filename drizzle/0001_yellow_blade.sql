CREATE TABLE `diaper_changes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`child` enum('nica','nici') NOT NULL,
	`type` enum('wet','dirty','both') NOT NULL,
	`notes` text,
	`loggedBy` int,
	`changedAt` bigint NOT NULL,
	`createdAt` bigint NOT NULL,
	CONSTRAINT `diaper_changes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `feeding_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`child` enum('nica','nici') NOT NULL,
	`leftStart` bigint,
	`leftEnd` bigint,
	`rightStart` bigint,
	`rightEnd` bigint,
	`bottleMl` int,
	`notes` text,
	`loggedBy` int,
	`createdAt` bigint NOT NULL,
	CONSTRAINT `feeding_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `telegram_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`botToken` varchar(256),
	`chatId` varchar(64),
	`enabled` boolean NOT NULL DEFAULT false,
	`digestTime` varchar(5) NOT NULL DEFAULT '21:00',
	`timezoneOffset` int NOT NULL DEFAULT 0,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `telegram_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `diaper_changes` ADD CONSTRAINT `diaper_changes_loggedBy_users_id_fk` FOREIGN KEY (`loggedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `feeding_sessions` ADD CONSTRAINT `feeding_sessions_loggedBy_users_id_fk` FOREIGN KEY (`loggedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;