-- MySQL Workbench Synchronization
-- Generated: 2026-06-20 11:43
-- Model: New Model
-- Version: 1.0
-- Project: Name of the project
-- Author: summe

SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0;
SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0;
SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

DROP SCHEMA IF EXISTS `mydb2`;
CREATE SCHEMA IF NOT EXISTS `mydb2` DEFAULT CHARACTER SET utf8 ;

CREATE TABLE IF NOT EXISTS `user` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `first_name` VARCHAR(45) NOT NULL,
  `last_name` VARCHAR(45) NOT NULL,
  `email_address` VARCHAR(45) NOT NULL,
  `role_id` INT(11) NOT NULL,
  `password` VARCHAR(255) NULL DEFAULT NULL,
  `grade` VARCHAR(45) NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `iduser_UNIQUE` (`id` ASC) ,
  UNIQUE INDEX `email_address_UNIQUE` (`email_address` ASC) ,
  INDEX `fk_user_role1_idx` (`role_id` ASC) ,
  CONSTRAINT `fk_user_role1`
    FOREIGN KEY (`role_id`)
    REFERENCES `role` (`id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION)
ENGINE = InnoDB
DEFAULT CHARACTER SET = utf8;

CREATE TABLE IF NOT EXISTS `role` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(45) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `role_name_UNIQUE` (`name` ASC) )
ENGINE = InnoDB
DEFAULT CHARACTER SET = utf8;

CREATE TABLE IF NOT EXISTS `class` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(45) NOT NULL,
  `teacher_id` INT(11) NOT NULL,
  `room_id` INT(11) NOT NULL,
  `grade_level` VARCHAR(45) NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `fk_class_user_idx` (`teacher_id` ASC) ,
  INDEX `fk_class_room1_idx` (`room_id` ASC) ,
  CONSTRAINT `fk_class_user`
    FOREIGN KEY (`teacher_id`)
    REFERENCES `user` (`id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION,
  CONSTRAINT `fk_class_room1`
    FOREIGN KEY (`room_id`)
    REFERENCES `room` (`id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION)
ENGINE = InnoDB
DEFAULT CHARACTER SET = utf8;

CREATE TABLE IF NOT EXISTS `room` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(45) NOT NULL,
  `event_id` INT(11) NOT NULL,
  `class_id` INT(11) NULL DEFAULT NULL,
  `period` VARCHAR(45) NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `fk_room_event1_idx` (`event_id` ASC) ,
  CONSTRAINT `fk_room_event1`
    FOREIGN KEY (`event_id`)
    REFERENCES `event` (`id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION)
ENGINE = InnoDB
DEFAULT CHARACTER SET = utf8;

CREATE TABLE IF NOT EXISTS `message` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `sender_id` INT(11) NOT NULL,
  `receiver_id` INT(11) NOT NULL,
  `message` VARCHAR(45) NOT NULL,
  PRIMARY KEY (`id`))
ENGINE = InnoDB
DEFAULT CHARACTER SET = utf8;

CREATE TABLE IF NOT EXISTS `schedule` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(45) NULL DEFAULT NULL,
  `decription` VARCHAR(255) NULL DEFAULT NULL,
  `event_id` INT(11) NULL DEFAULT NULL,
  `student_id` INT(11) NULL DEFAULT NULL,
  `student_name` VARCHAR(255) NULL DEFAULT NULL,
  `time` VARCHAR(45) NULL DEFAULT NULL,
  `period` VARCHAR(45) NULL DEFAULT NULL,
  `teacher` VARCHAR(255) NULL DEFAULT NULL,
  `room` VARCHAR(255) NULL DEFAULT NULL,
  `class_name` VARCHAR(255) NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `fk_schedule_event_idx` (`event_id` ASC) ,
  CONSTRAINT `fk_schedule_event`
    FOREIGN KEY (`event_id`)
    REFERENCES `event` (`id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION)
ENGINE = InnoDB
DEFAULT CHARACTER SET = utf8;

CREATE TABLE IF NOT EXISTS `student_class` (
  `id` INT(11) NOT NULL,
  `grade_level` VARCHAR(45) NULL DEFAULT NULL,
  `user_iduser` INT(11) NOT NULL,
  `class_idclass` INT(11) NOT NULL,
  PRIMARY KEY (`id`, `user_iduser`, `class_idclass`),
  INDEX `fk_student_class_user1_idx` (`user_iduser` ASC) ,
  INDEX `fk_student_class_class1_idx` (`class_idclass` ASC) ,
  CONSTRAINT `fk_student_class_user1`
    FOREIGN KEY (`user_iduser`)
    REFERENCES `user` (`id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION,
  CONSTRAINT `fk_student_class_class1`
    FOREIGN KEY (`class_idclass`)
    REFERENCES `class` (`id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION)
ENGINE = InnoDB
DEFAULT CHARACTER SET = utf8;

CREATE TABLE IF NOT EXISTS `club` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(45) NOT NULL,
  `description` VARCHAR(45) NULL DEFAULT NULL,
  PRIMARY KEY (`id`))
ENGINE = InnoDB
DEFAULT CHARACTER SET = utf8;

CREATE TABLE IF NOT EXISTS `event` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(45) NOT NULL,
  `description` VARCHAR(45) NULL DEFAULT NULL,
  `room` VARCHAR(255) NULL DEFAULT NULL,
  `date` DATETIME NULL DEFAULT NULL,
  PRIMARY KEY (`id`))
ENGINE = InnoDB
DEFAULT CHARACTER SET = utf8;

CREATE TABLE IF NOT EXISTS `club_has_event` (
  `club_id` INT(11) NOT NULL,
  `event_id` INT(11) NOT NULL,
  PRIMARY KEY (`club_id`, `event_id`),
  INDEX `fk_club_has_event_event1_idx` (`event_id` ASC) ,
  INDEX `fk_club_has_event_club1_idx` (`club_id` ASC) ,
  CONSTRAINT `fk_club_has_event_club1`
    FOREIGN KEY (`club_id`)
    REFERENCES `club` (`id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION,
  CONSTRAINT `fk_club_has_event_event1`
    FOREIGN KEY (`event_id`)
    REFERENCES `event` (`id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION)
  
ENGINE = InnoDB
DEFAULT CHARACTER SET = utf8;

CREATE TABLE IF NOT EXISTS `reviews` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `rating` INT NOT NULL,
  `comment` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);

CREATE TABLE IF NOT EXISTS `announcements` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(255) NOT NULL,
  `content` TEXT NOT NULL,
  `created_by` INT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);
CREATE TABLE volunteer_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  teacher_id INT NOT NULL,
  student_id INT NOT NULL,
  class_id INT DEFAULT NULL,
  message TEXT DEFAULT NULL,
  status VARCHAR(45) NOT NULL DEFAULT 'pending',
  approved TINYINT(1) NOT NULL DEFAULT 0,
  approved_by INT DEFAULT NULL,
  approved_at DATETIME DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_volunteer_requests_teacher (teacher_id),
  INDEX idx_volunteer_requests_student (student_id),
  INDEX idx_volunteer_requests_class (class_id)
);

CREATE TABLE volunteer_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  volunteer_request_id INT DEFAULT NULL,
  student_id INT NOT NULL,
  class_id INT NOT NULL,
  teacher_id INT NOT NULL,
  assigned_by INT DEFAULT NULL,
  status VARCHAR(45) NOT NULL DEFAULT 'requested',
  approved TINYINT(1) NOT NULL DEFAULT 0,
  approved_by INT DEFAULT NULL,
  approved_at DATETIME DEFAULT NULL,
  check_in DATETIME DEFAULT NULL,
  check_out DATETIME DEFAULT NULL,
  total_hours DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_volunteer_assignments_request (volunteer_request_id),
  INDEX idx_volunteer_assignments_student (student_id),
  INDEX idx_volunteer_assignments_class (class_id),
  INDEX idx_volunteer_assignments_teacher (teacher_id)
);

CREATE TABLE volunteer_hours (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  class_id INT NOT NULL,
  check_in DATETIME DEFAULT NULL,
  check_out DATETIME DEFAULT NULL,
  total_hours DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  approved_by INT DEFAULT NULL,
  approved TINYINT(1) NOT NULL DEFAULT 0,
  approval_status VARCHAR(45) NOT NULL DEFAULT 'pending',
  volunteer_request_id INT DEFAULT NULL,
  volunteer_assignment_id INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_volunteer_hours_student (student_id),
  INDEX idx_volunteer_hours_class (class_id),
  INDEX idx_volunteer_hours_request (volunteer_request_id),
  INDEX idx_volunteer_hours_assignment (volunteer_assignment_id)
);

SET SQL_MODE=@OLD_SQL_MODE;
SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS;
SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS;


INSERT INTO `role` (`name`) VALUES ('Admin');
INSERT INTO `role` (`name`) VALUES ('Teacher');
INSERT INTO `role` (`name`) VALUES ('Student');
INSERT INTO `user` (`first_name`, `last_name`, `email_address`, `role_id`) VALUES ('Ali', 'Ashraf', 'aashraf@gmail.com', '2');
INSERT INTO `user` (`first_name`, `last_name`, `email_address`, `role_id`) VALUES ('Omar', 'ahmed', 'oahmed@gmail.com', '3');
INSERT INTO `event` (`name`, `description`, `room`, `date`) VALUES ('Orientation', 'Welcome and info session', 'Auditorium', '2026-07-05 12:30:00');
INSERT INTO `event` (`name`, `description`, `room`, `date`) VALUES ('Science Fair', 'Student science projects', 'Lab 1', '2026-07-15 09:00:00');

INSERT INTO `room` (`name`, `event_id`) VALUES ('Auditorium', 1);
INSERT INTO `room` (`name`, `event_id`) VALUES ('Lab 1', 2);

INSERT INTO `club` (`name`, `description`) VALUES ('Chess Club', 'Weekly chess meetings');
INSERT INTO `club` (`name`, `description`) VALUES ('Robotics Club', 'Build and program robots');

INSERT INTO `club_has_event` (`club_id`, `event_id`) VALUES (1, 1);
INSERT INTO `club_has_event` (`club_id`, `event_id`) VALUES (2, 2);

INSERT INTO `class` (`name`, `teacher_id`, `room_id`) VALUES ('Biology 101', 1, 2);
INSERT INTO `class` (`name`, `teacher_id`, `room_id`) VALUES ('Math 201', 1, 1);

INSERT INTO `student_class` (`id`, `grade_level`, `user_iduser`, `class_idclass`) VALUES (1, '10', 2, 1);

INSERT INTO `message` (`sender_id`, `receiver_id`, `message`) VALUES (1, 2, 'Welcome to the system');
INSERT INTO `message` (`sender_id`, `receiver_id`, `message`) VALUES (2, 1, 'Thanks, got it');

INSERT INTO `schedule` (`name`, `decription`, `event_id`) VALUES ('Orientation Morning', 'For new students', 1);
INSERT INTO `schedule` (`name`, `decription`, `event_id`) VALUES ('Science Fair Day', 'Bring projects', 2);
INSERT INTO `reviews` (`user_id`, `rating`, `comment`) VALUES
(1, 5, 'Great system and very easy to use!'),
(2, 4, 'Helpful, though a few features could be faster.');


ALTER TABLE `class` DROP PRIMARY KEY, ADD PRIMARY KEY (`id`);
ALTER TABLE `class` MODIFY COLUMN `teacher_id` INT NULL;
ALTER TABLE `class` MODIFY COLUMN `room_id` INT NULL;

SET FOREIGN_KEY_CHECKS = 0;

-- Move Teacher (currently id=1) to a temporary holding spot
UPDATE role SET id = 99 WHERE id = 1;
UPDATE user SET role_id = 99 WHERE role_id = 1;

-- Move Admin (currently id=2) into the now-empty id=1
UPDATE role SET id = 1 WHERE id = 2;
UPDATE user SET role_id = 1 WHERE role_id = 2;

-- Move Teacher from the temporary spot (99) into id=2
UPDATE role SET id = 2 WHERE id = 99;
UPDATE user SET role_id = 2 WHERE role_id = 99;

SET FOREIGN_KEY_CHECKS = 1;

INSERT INTO `announcements` (`title`, `content`, `created_by`) VALUES
('Welcome to the New Term', 'Please make sure all attendance records are updated weekly.', 1),
('System Maintenance', 'Scheduled downtime this coming Saturday at midnight.', 1);
ALTER TABLE `user` 
ADD COLUMN `password` VARCHAR(45) NOT NULL AFTER `role_id`;
update `user` set password="test";
UPDATE `user` SET `role_id` = '1' WHERE (`id` = '1') and (`role_id` = '2');

INSERT INTO `user` (`id`, `first_name`, `last_name`, `email_address`, `role_id`, `password`) VALUES
(10, 'Maya', 'Patel', 'maya.patel@example.com', 1, 'test'),
(11, 'Jordan', 'Lee', 'jordan.lee@example.com', 2, 'test'),
(12, 'Ava', 'Thompson', 'ava.thompson@example.com', 2, 'test'),
(13, 'Eli', 'Ramirez', 'eli.ramirez@example.com', 2, 'test'),
(14, 'Sofia', 'Miller', 'sofia.miller@example.com', 2, 'test'),
(15, 'Noah', 'Kim', 'noah.kim@example.com', 2, 'test'),
(20, 'Noah', 'Reed', 'noah.reed@example.com', 3, 'test'),
(21, 'Lila', 'Santos', 'lila.santos@example.com', 3, 'test'),
(22, 'Ethan', 'Nguyen', 'ethan.nguyen@example.com', 3, 'test'),
(23, 'Zara', 'Ali', 'zara.ali@example.com', 3, 'test');

INSERT INTO `class` (`id`, `name`, `teacher_id`, `room_id`, `room`, `period`, `time`, `grade_level`) VALUES
(10, 'Algebra I', 10, 1, 'Room 101', 'A1', '08:00-08:50', '10'),
(11, 'Biology Lab', 11, 2, 'Lab 1', 'B2', '10:05-10:55', '11'),
(12, 'Study Hall Support', 10, 1, 'Library', 'C3', '12:15-01:00', 'All'),
(13, 'Chemistry Lab', 12, 2, 'Lab 1', 'D1', '01:15-02:05', '11'),
(14, 'Creative Writing', 13, 1, 'Room 101', 'E2', '02:10-03:00', '10'),
(15, 'Physics Lab', 14, 2, 'Lab 1', 'F1', '08:55-09:45', '11'),
(16, 'Reading Workshop', 15, 1, 'Room 101', 'F2', '09:50-10:40', '10');

INSERT INTO `student_class` (`id`, `grade_level`, `user_iduser`, `class_idclass`) VALUES
(10, '10', 20, 10),
(11, '11', 21, 11),
(12, '10', 22, 12),
(13, '11', 23, 11);

INSERT INTO `schedule` (`id`, `name`, `decription`, `event_id`, `student_id`, `student_name`, `time`, `period`, `teacher`, `room`, `class_name`) VALUES
(10, 'Math Class', 'Regular class period', NULL, 20, 'Noah Reed', '08:00-08:50', 'A1', 'Maya Patel', 'Room 101', 'Algebra I'),
(11, 'Independent Period', 'Independent study time', NULL, 20, 'Noah Reed', '09:00-09:45', 'A2', NULL, 'Library', 'Independent Period'),
(12, 'Study Hall', 'Supervised study hall', NULL, 21, 'Lila Santos', '12:15-01:00', 'C3', 'Jordan Lee', 'Library', 'Study Hall'),
(13, 'Biology Lab', 'Regular class period', 2, 21, 'Lila Santos', '10:05-10:55', 'B2', 'Jordan Lee', 'Lab 1', 'Biology Lab'),
(14, 'Orientation', 'School opening event', 1, 22, 'Ethan Nguyen', '12:30-01:30', 'Advisory', NULL, 'Auditorium', 'Event');

INSERT INTO `volunteer_requests` (`id`, `teacher_id`, `student_id`, `class_id`, `message`, `status`, `approved`, `approved_by`, `approved_at`) VALUES
(10, 10, 20, 10, 'Need a volunteer for the lab cleanup block.', 'pending', 0, NULL, NULL),
(11, 11, 21, 11, 'Approved for study hall support during second period.', 'approved', 1, 1, '2026-07-01 09:30:00');

INSERT INTO `volunteer_assignments` (`id`, `volunteer_request_id`, `student_id`, `class_id`, `teacher_id`, `assigned_by`, `status`, `approved`, `approved_by`, `approved_at`, `check_in`, `check_out`, `total_hours`) VALUES
(10, 10, 20, 10, 10, 1, 'requested', 0, NULL, NULL, NULL, NULL, 0.00),
(11, 11, 21, 11, 11, 1, 'arrived', 1, 1, '2026-07-01 10:00:00', '2026-07-01 10:05:00', '2026-07-01 11:35:00', 1.50);

INSERT INTO `volunteer_hours` (`id`, `student_id`, `class_id`, `check_in`, `check_out`, `total_hours`, `approved_by`, `approved`, `approval_status`, `volunteer_request_id`, `volunteer_assignment_id`) VALUES
(10, 22, '2026-07-02 12:10:00', '2026-07-02 13:00:00', 0.83, 1, 1, 'approved', 11, 11),
(11, 21, 11, '2026-07-03 10:00:00', '2026-07-03 11:30:00', 1.50, 1, 1, 'approved', 11, 11),
(13, 20, 15, '2026-07-04 08:55:00', NULL, 0.00, NULL, 0, 'pending', 13, 13),
(14, 23, 16, '2026-07-04 09:50:00', '2026-07-04 10:40:00', 0.83, 1, 1, 'approved', 14, 14);

INSERT INTO `volunteer_requests` (`id`, `teacher_id`, `student_id`, `class_id`, `message`, `status`, `approved`, `approved_by`, `approved_at`) VALUES
(13, 14, 20, 15, 'Need a volunteer for the physics lab demo.', 'approved', 1, 1, '2026-07-04 08:30:00'),
(14, 15, 23, 16, 'Need a volunteer for the reading workshop.', 'approved', 1, 1, '2026-07-04 09:30:00');

INSERT INTO `volunteer_assignments` (`id`, `volunteer_request_id`, `student_id`, `class_id`, `teacher_id`, `assigned_by`, `status`, `approved`, `approved_by`, `approved_at`, `check_in`, `check_out`, `total_hours`) VALUES
(13, 13, 20, 15, 14, 1, 'checked_in', 1, 1, '2026-07-04 08:40:00', '2026-07-04 08:55:00', NULL, 0.00),
(14, 14, 23, 16, 15, 1, 'returning_confirmation', 1, 1, '2026-07-04 09:35:00', '2026-07-04 09:50:00', '2026-07-04 10:40:00', 0.83);

INSERT INTO `volunteer_requests` (`id`, `teacher_id`, `student_id`, `class_id`, `message`, `status`, `approved`, `approved_by`, `approved_at`) VALUES
(10, 23, 'Need an extra volunteer for study hall supervision.', 'pending', 0, NULL, NULL);

INSERT INTO `volunteer_assignments` (`id`, `volunteer_request_id`, `student_id`, `class_id`, `teacher_id`, `assigned_by`, `status`, `approved`, `approved_by`, `approved_at`, `check_in`, `check_out`, `total_hours`) VALUES
(23, 10, 1, 'requested', 0, NULL, NULL, NULL, NULL, 0.00);
