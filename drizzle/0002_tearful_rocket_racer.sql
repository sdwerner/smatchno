CREATE TABLE `vitamin_d_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`child` enum('nica','nici') NOT NULL,
	`givenAt` bigint NOT NULL,
	`notes` text,
	`loggedBy` int,
	`createdAt` bigint NOT NULL,
	CONSTRAINT `vitamin_d_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `vitamin_d_logs` ADD CONSTRAINT `vitamin_d_logs_loggedBy_users_id_fk` FOREIGN KEY (`loggedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;