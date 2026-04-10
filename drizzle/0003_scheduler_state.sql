CREATE TABLE `scheduler_state` (
	`id` int AUTO_INCREMENT NOT NULL,
	`lastDigestSentDate` varchar(10),
	`lastFeedingReminderNica` bigint,
	`lastFeedingReminderNici` bigint,
	`lastVitaminDReminderNica` bigint,
	`lastVitaminDReminderNici` bigint,
	`feedingSnoozeUntil` bigint NOT NULL DEFAULT 0,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `scheduler_state_id` PRIMARY KEY(`id`)
);
