-- Baby Tracker SQL Dump
-- Generated: 2026-03-26T13:22:36.130Z
-- MySQL 8.0 compatible

SET FOREIGN_KEY_CHECKS=0;
SET SQL_MODE='NO_AUTO_VALUE_ON_ZERO';
SET NAMES utf8mb4;

-- ----------------------------
-- Table: users
-- ----------------------------
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `openId` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(320) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `loginMethod` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `role` enum('user','admin') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'user',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `lastSignedIn` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `users_openId_unique` (`openId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=600001;

INSERT INTO `users` (`id`, `openId`, `name`, `email`, `loginMethod`, `role`, `createdAt`, `updatedAt`, `lastSignedIn`) VALUES
  (1, '6Eyk3RevV8ypUQRt4S2Uwi', 'callibreed0815', 'wernersd4@gmail.com', 'email', 'admin', '2026-03-19 17:28:28.000', '2026-03-26 17:22:31.000', '2026-03-26 17:22:31.000');

-- ----------------------------
-- Table: feeding_sessions
-- ----------------------------
DROP TABLE IF EXISTS `feeding_sessions`;
CREATE TABLE `feeding_sessions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `child` enum('nica','nici') COLLATE utf8mb4_unicode_ci NOT NULL,
  `leftStart` bigint DEFAULT NULL,
  `leftEnd` bigint DEFAULT NULL,
  `rightStart` bigint DEFAULT NULL,
  `rightEnd` bigint DEFAULT NULL,
  `bottleMl` int DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `loggedBy` int DEFAULT NULL,
  `createdAt` bigint NOT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `feeding_sessions_loggedBy_users_id_fk` (`loggedBy`),
  CONSTRAINT `feeding_sessions_loggedBy_users_id_fk` FOREIGN KEY (`loggedBy`) REFERENCES `users` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=1050001;

INSERT INTO `feeding_sessions` (`id`, `child`, `leftStart`, `leftEnd`, `rightStart`, `rightEnd`, `bottleMl`, `notes`, `loggedBy`, `createdAt`) VALUES
  (30003, 'nica', 1774188000000, 1774188900000, NULL, NULL, NULL, 'via bot', NULL, 1774176693184),
  (30006, 'nica', 1774182300000, 1774183200000, NULL, NULL, 20, 'via bot (own)', NULL, 1774179638380),
  (30007, 'nica', NULL, NULL, NULL, NULL, 15, 'via bot', NULL, 1774180102751),
  (30008, 'nica', NULL, NULL, NULL, NULL, 30, 'via bot', NULL, 1774180721554),
  (30009, 'nici', NULL, NULL, 1774186200000, 1774187400000, 45, 'via bot', NULL, 1774185234866),
  (30010, 'nici', NULL, NULL, 1774170000000, 1774173600000, 25, 'via bot (own)', NULL, 1774185272692),
  (60001, 'nica', 1774194000000, 1774195200000, NULL, NULL, NULL, 'via bot', NULL, 1774192733993),
  (90001, 'nica', 1774198200000, 1774199400000, NULL, NULL, NULL, 'via bot', NULL, 1774196522252),
  (90002, 'nica', 1774198200000, 1774199400000, NULL, NULL, NULL, 'via bot', NULL, 1774196522676),
  (90003, 'nici', NULL, NULL, 1774199700000, 1774200900000, NULL, 'via bot', NULL, 1774197611290),
  (90004, 'nica', 1774203300000, 1774204200000, NULL, NULL, NULL, 'via bot', NULL, 1774201418653),
  (120001, 'nici', NULL, NULL, 1774204500000, 1774206000000, NULL, 'via bot', NULL, 1774203972465),
  (150001, 'nici', NULL, NULL, 1774211400000, 1774212600000, 35, 'via bot', NULL, 1774210252760),
  (150002, 'nica', NULL, NULL, 1774211400000, 1774212600000, NULL, 'via bot', NULL, 1774210323199),
  (180001, 'nica', NULL, NULL, 1773985500000, 1773986400000, 15, 'via bot', NULL, 1774008000000),
  (180002, 'nici', NULL, NULL, 1773987900000, 1773988500000, 20, 'via bot', NULL, 1774008000000),
  (180003, 'nica', NULL, NULL, 1773991800000, 1773992400000, 20, 'via bot', NULL, 1774008000000),
  (180004, 'nica', NULL, NULL, 1774002900000, 1774003800000, 5, 'via bot', NULL, 1774008000000),
  (180005, 'nici', NULL, NULL, 1774004700000, 1774005900000, 15, 'via bot', NULL, 1774008000000),
  (180006, 'nica', NULL, NULL, 1774013400000, 1774015200000, 8, 'via bot', NULL, 1774008000000),
  (210001, 'nici', NULL, NULL, 1774222200000, 1774223100000, 45, 'via bot', NULL, 1774220625534),
  (240001, 'nica', NULL, NULL, NULL, NULL, 45, 'via bot', NULL, 1774222972882),
  (240002, 'nici', NULL, NULL, 1774227300000, 1774228500000, NULL, 'via bot', NULL, 1774224444271),
  (270001, 'nici', NULL, NULL, 1774234800000, 1774235400000, NULL, 'via bot', NULL, 1774234577688),
  (270002, 'nici', NULL, NULL, NULL, NULL, 55, 'via bot', NULL, 1774234591964),
  (270003, 'nica', NULL, NULL, 1774236600000, 1774237200000, NULL, 'via bot', NULL, 1774234665343),
  (270004, 'nica', NULL, NULL, NULL, NULL, 40, 'via bot (own)', NULL, 1774234677763),
  (270005, 'nica', NULL, NULL, NULL, NULL, 15, 'via bot', NULL, 1774234692656),
  (300001, 'nica', NULL, NULL, 1774250400000, 1774252200000, NULL, 'via bot', NULL, 1774252315220),
  (330001, 'nici', NULL, NULL, 1774255800000, 1774257960000, NULL, 'via bot', NULL, 1774254388173),
  (360001, 'nica', NULL, NULL, NULL, NULL, 65, 'via bot', NULL, 1774259393883),
  (360002, 'nici', NULL, NULL, NULL, NULL, 55, 'via bot', NULL, 1774259422403),
  (390001, 'nici', NULL, NULL, 1774272600000, 1774274700000, NULL, 'via bot', NULL, 1774271405719),
  (420001, 'nica', 1774275600000, 1774275900000, NULL, NULL, NULL, 'via bot', NULL, 1774274538657),
  (420002, 'nica', NULL, NULL, NULL, NULL, 60, 'via bot (own)', NULL, 1774274633973),
  (450001, 'nica', NULL, NULL, 1774290600000, 1774291200000, NULL, 'via bot', NULL, 1774289336120),
  (450002, 'nici', 1774292400000, 1774293900000, NULL, NULL, NULL, 'via bot', NULL, 1774290350964),
  (450003, 'nica', NULL, NULL, NULL, NULL, 19, 'via bot (own)', NULL, 1774291126227),
  (450004, 'nici', NULL, NULL, NULL, NULL, 35, 'via bot (own)', NULL, 1774292113145),
  (480001, 'nici', 1774300800000, 1774302180000, NULL, NULL, NULL, 'via bot', NULL, 1774298628191),
  (480002, 'nica', NULL, NULL, 1774300800000, 1774302600000, NULL, 'via bot', NULL, 1774299497862),
  (510001, 'nica', NULL, NULL, 1774306800000, 1774308000000, NULL, 'via bot', NULL, 1774304973704),
  (510002, 'nici', 1774306800000, 1774307700000, NULL, NULL, NULL, 'via bot', NULL, 1774304987598),
  (510003, 'nica', NULL, NULL, NULL, NULL, 60, 'via bot', NULL, 1774306543421),
  (510004, 'nici', NULL, NULL, NULL, NULL, 45, 'via bot', NULL, 1774306572675),
  (540001, 'nica', 1774317900000, 1774319700000, NULL, NULL, NULL, 'via bot', NULL, 1774320269439),
  (570001, 'nica', NULL, NULL, NULL, NULL, 75, 'via bot', NULL, 1774322246360),
  (570002, 'nici', NULL, NULL, 1774320000000, 1774322940000, NULL, 'via bot', NULL, 1774322982880),
  (600001, 'nici', NULL, NULL, NULL, NULL, 25, 'via bot', NULL, 1774326437411),
  (630001, 'nici', NULL, NULL, 1774335600000, 1774338300000, NULL, 'via bot', NULL, 1774342687265),
  (630002, 'nica', NULL, NULL, 1774337400000, 1774338000000, NULL, 'via bot', NULL, 1774342714009),
  (630003, 'nica', NULL, NULL, 1774342500000, 1774343640000, NULL, 'via bot', NULL, 1774343674104),
  (660001, 'nica', NULL, NULL, 1774362000000, 1774364400000, NULL, 'via bot', NULL, 1774365664429),
  (690001, 'nici', NULL, NULL, 1774365000000, 1774365600000, NULL, 'via bot', NULL, 1774368134449),
  (690002, 'nici', NULL, NULL, NULL, NULL, 50, 'via bot (own)', NULL, 1774368156425),
  (720002, 'nici', NULL, NULL, NULL, NULL, 40, 'via bot (own)', NULL, 1774392817165),
  (720003, 'nica', NULL, NULL, NULL, NULL, 50, 'via bot (own)', NULL, 1774392928142),
  (750001, 'nici', NULL, NULL, NULL, NULL, 70, 'via bot', NULL, 1774398876421),
  (750002, 'nica', NULL, NULL, NULL, NULL, 70, 'via bot', NULL, 1774398894750),
  (780001, 'nica', NULL, NULL, 1774407600000, 1774408800000, 20, 'via bot', NULL, 1774410598344),
  (780002, 'nici', NULL, NULL, 1774408800000, 1774410000000, NULL, 'via bot', NULL, 1774410622753),
  (810001, 'nica', NULL, NULL, 1774425600000, 1774429200000, NULL, 'via bot', NULL, 1774436373630),
  (810002, 'nici', NULL, NULL, 1774429200000, 1774431000000, NULL, 'via bot', NULL, 1774436387939),
  (840001, 'nici', NULL, NULL, NULL, NULL, 65, 'via bot', NULL, 1774448959302),
  (840002, 'nica', NULL, NULL, NULL, NULL, 55, 'via bot', NULL, 1774448980063),
  (870001, 'nica', NULL, NULL, NULL, NULL, 50, 'via bot', NULL, 1774461609149),
  (870002, 'nici', NULL, NULL, NULL, NULL, 40, 'via bot', NULL, 1774461627893),
  (900001, 'nici', NULL, NULL, 1774465200000, 1774466400000, NULL, 'via bot', NULL, 1774467379000),
  (900002, 'nica', 1774465200000, 1774466400000, NULL, NULL, NULL, 'via bot', NULL, 1774467436647),
  (900003, 'nica', NULL, NULL, 1774466400000, 1774468200000, NULL, 'via bot', NULL, 1774467457305),
  (930002, 'nici', NULL, NULL, NULL, NULL, 40, 'via bot (own)', NULL, 1774476627330),
  (930003, 'nica', NULL, NULL, NULL, NULL, 40, 'via bot (own)', NULL, 1774476666746),
  (930004, 'nici', NULL, NULL, NULL, NULL, 30, 'via bot', NULL, 1774476681985),
  (960001, 'nica', NULL, NULL, 1774565400000, 1774484340000, NULL, 'via bot', NULL, 1774483765011),
  (990001, 'nica', NULL, NULL, 1774485600000, 1774486800000, NULL, 'via bot', NULL, 1774516439414),
  (990002, 'nica', 1774494000000, 1774495200000, NULL, NULL, NULL, 'via bot', NULL, 1774516465811),
  (990003, 'nici', 1774501200000, 1774502400000, NULL, NULL, NULL, 'via bot', NULL, 1774516551501),
  (990004, 'nica', 1774501200000, 1774502400000, NULL, NULL, NULL, 'via bot', NULL, 1774516587781),
  (990005, 'nica', NULL, NULL, 1774515600000, 1774517400000, NULL, 'via bot', NULL, 1774516617435),
  (990006, 'nici', NULL, NULL, 1774485600000, 1774486800000, NULL, 'via bot', NULL, 1774516698906),
  (990007, 'nici', NULL, NULL, 1774494000000, 1774495200000, NULL, 'via bot', NULL, 1774516727936),
  (990008, 'nici', NULL, NULL, 1774502400000, 1774503600000, NULL, 'via bot', NULL, 1774516754394),
  (1020001, 'nici', 1774517400000, 1774518600000, NULL, NULL, NULL, 'via bot', NULL, 1774522971295),
  (1020002, 'nica', NULL, NULL, 1774522200000, 1774523400000, NULL, 'via bot', NULL, 1774523537462);

-- ----------------------------
-- Table: diaper_changes
-- ----------------------------
DROP TABLE IF EXISTS `diaper_changes`;
CREATE TABLE `diaper_changes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `child` enum('nica','nici') COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` enum('wet','dirty','both') COLLATE utf8mb4_unicode_ci NOT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `loggedBy` int DEFAULT NULL,
  `changedAt` bigint NOT NULL,
  `createdAt` bigint NOT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `diaper_changes_loggedBy_users_id_fk` (`loggedBy`),
  CONSTRAINT `diaper_changes_loggedBy_users_id_fk` FOREIGN KEY (`loggedBy`) REFERENCES `users` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=150001;

INSERT INTO `diaper_changes` (`id`, `child`, `type`, `notes`, `loggedBy`, `changedAt`, `createdAt`) VALUES
  (1, 'nica', 'wet', 'via bot', NULL, 1774210129845, 1774210129845),
  (30001, 'nici', 'wet', 'via bot', NULL, 1774224487490, 1774224487490),
  (60001, 'nica', 'wet', 'via bot', NULL, 1774247223585, 1774247223585),
  (90001, 'nici', 'wet', 'via bot', NULL, 1774252338813, 1774252338813),
  (120001, 'nica', 'both', 'via bot', NULL, 1774393175723, 1774393175723),
  (120002, 'nici', 'both', 'via bot', NULL, 1774393186708, 1774393186708);

-- ----------------------------
-- Table: telegram_settings
-- ----------------------------
DROP TABLE IF EXISTS `telegram_settings`;
CREATE TABLE `telegram_settings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `botToken` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `chatId` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT '0',
  `digestTime` varchar(5) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '21:00',
  `timezoneOffset` int NOT NULL DEFAULT '0',
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- (no data)

SET FOREIGN_KEY_CHECKS=1;
