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

CREATE TABLE IF NOT EXISTS `mydb`.`user` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `first_name` VARCHAR(45) NOT NULL,
  `last_name` VARCHAR(45) NOT NULL,
  `email_address` VARCHAR(45) NOT NULL,
  `role_id` INT(11) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `iduser_UNIQUE` (`id` ASC) ,
  UNIQUE INDEX `email_address_UNIQUE` (`email_address` ASC) ,
  INDEX `fk_user_role1_idx` (`role_id` ASC) ,
  CONSTRAINT `fk_user_role1`
    FOREIGN KEY (`role_id`)
    REFERENCES `mydb`.`role` (`id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION)
ENGINE = InnoDB
DEFAULT CHARACTER SET = utf8;

CREATE TABLE IF NOT EXISTS `mydb`.`role` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(45) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `role_name_UNIQUE` (`name` ASC) )
ENGINE = InnoDB
DEFAULT CHARACTER SET = utf8;

CREATE TABLE IF NOT EXISTS `mydb`.`class` (
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
    REFERENCES `mydb`.`user` (`id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION,
  CONSTRAINT `fk_class_room1`
    FOREIGN KEY (`room_id`)
    REFERENCES `mydb`.`room` (`id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION)
ENGINE = InnoDB
DEFAULT CHARACTER SET = utf8;

CREATE TABLE IF NOT EXISTS `mydb`.`room` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(45) NOT NULL,
  `event_id` INT(11) NOT NULL,
  `class_id` INT(11) NULL DEFAULT NULL,
  `period` VARCHAR(45) NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `fk_room_event1_idx` (`event_id` ASC) ,
  CONSTRAINT `fk_room_event1`
    FOREIGN KEY (`event_id`)
    REFERENCES `mydb`.`event` (`id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION)
ENGINE = InnoDB
DEFAULT CHARACTER SET = utf8;

CREATE TABLE IF NOT EXISTS `mydb`.`message` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `sender_id` INT(11) NOT NULL,
  `receiver_id` INT(11) NOT NULL,
  `message` VARCHAR(45) NOT NULL,
  PRIMARY KEY (`id`))
ENGINE = InnoDB
DEFAULT CHARACTER SET = utf8;

CREATE TABLE IF NOT EXISTS `mydb`.`schedule` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(45) NOT NULL,
  `decription` VARCHAR(255) NULL DEFAULT NULL,
  `event_id` INT(11) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `fk_schedule_event_idx` (`event_id` ASC) ,
  CONSTRAINT `fk_schedule_event`
    FOREIGN KEY (`event_id`)
    REFERENCES `mydb`.`event` (`id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION)
ENGINE = InnoDB
DEFAULT CHARACTER SET = utf8;

CREATE TABLE IF NOT EXISTS `mydb`.`student_class` (
  `id` INT(11) NOT NULL,
  `grade_level` VARCHAR(45) NULL DEFAULT NULL,
  `user_iduser` INT(11) NOT NULL,
  `class_idclass` INT(11) NOT NULL,
  PRIMARY KEY (`id`, `user_iduser`, `class_idclass`),
  INDEX `fk_student_class_user1_idx` (`user_iduser` ASC) ,
  INDEX `fk_student_class_class1_idx` (`class_idclass` ASC) ,
  CONSTRAINT `fk_student_class_user1`
    FOREIGN KEY (`user_iduser`)
    REFERENCES `mydb`.`user` (`id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION,
  CONSTRAINT `fk_student_class_class1`
    FOREIGN KEY (`class_idclass`)
    REFERENCES `mydb`.`class` (`id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION)
ENGINE = InnoDB
DEFAULT CHARACTER SET = utf8;

CREATE TABLE IF NOT EXISTS `mydb`.`club` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(45) NOT NULL,
  `description` VARCHAR(45) NULL DEFAULT NULL,
  PRIMARY KEY (`id`))
ENGINE = InnoDB
DEFAULT CHARACTER SET = utf8;

CREATE TABLE IF NOT EXISTS `mydb`.`event` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(45) NOT NULL,
  `description` VARCHAR(45) NULL DEFAULT NULL,
  PRIMARY KEY (`id`))
ENGINE = InnoDB
DEFAULT CHARACTER SET = utf8;

CREATE TABLE IF NOT EXISTS `mydb`.`club_has_event` (
  `club_id` INT(11) NOT NULL,
  `event_id` INT(11) NOT NULL,
  PRIMARY KEY (`club_id`, `event_id`),
  INDEX `fk_club_has_event_event1_idx` (`event_id` ASC) ,
  INDEX `fk_club_has_event_club1_idx` (`club_id` ASC) ,
  CONSTRAINT `fk_club_has_event_club1`
    FOREIGN KEY (`club_id`)
    REFERENCES `mydb`.`club` (`id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION,
  CONSTRAINT `fk_club_has_event_event1`
    FOREIGN KEY (`event_id`)
    REFERENCES `mydb`.`event` (`id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION)
ENGINE = InnoDB
DEFAULT CHARACTER SET = utf8;


SET SQL_MODE=@OLD_SQL_MODE;
SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS;
SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS;


INSERT INTO `mydb`.`role` (`name`) VALUES ('Teacher');
INSERT INTO `mydb`.`role` (`name`) VALUES ('Admin');
INSERT INTO `mydb`.`role` (`name`) VALUES ('Student');
INSERT INTO `mydb`.`user` (`first_name`, `last_name`, `email_address`, `role_id`) VALUES ('Ali', 'Ashraf', 'aashraf@gmail.com', '2');
INSERT INTO `mydb`.`user` (`first_name`, `last_name`, `email_address`, `role_id`) VALUES ('Omar', 'ahmed', 'oahmed@gmail.com', '3');
INSERT INTO `mydb`.`event` (`name`, `description`) VALUES ('Orientation', 'Welcome and info session');
INSERT INTO `mydb`.`event` (`name`, `description`) VALUES ('Science Fair', 'Student science projects');

INSERT INTO `mydb`.`room` (`name`, `event_id`) VALUES ('Auditorium', 1);
INSERT INTO `mydb`.`room` (`name`, `event_id`) VALUES ('Lab 1', 2);

INSERT INTO `mydb`.`club` (`name`, `description`) VALUES ('Chess Club', 'Weekly chess meetings');
INSERT INTO `mydb`.`club` (`name`, `description`) VALUES ('Robotics Club', 'Build and program robots');

INSERT INTO `mydb`.`club_has_event` (`club_id`, `event_id`) VALUES (1, 1);
INSERT INTO `mydb`.`club_has_event` (`club_id`, `event_id`) VALUES (2, 2);

INSERT INTO `mydb`.`class` (`name`, `teacher_id`, `room_id`) VALUES ('Biology 101', 1, 2);
INSERT INTO `mydb`.`class` (`name`, `teacher_id`, `room_id`) VALUES ('Math 201', 1, 1);

INSERT INTO `mydb`.`student_class` (`id`, `grade_level`, `user_iduser`, `class_idclass`) VALUES (1, '10', 2, 1);

INSERT INTO `mydb`.`message` (`sender_id`, `receiver_id`, `message`) VALUES (1, 2, 'Welcome to the system');
INSERT INTO `mydb`.`message` (`sender_id`, `receiver_id`, `message`) VALUES (2, 1, 'Thanks, got it');

INSERT INTO `mydb`.`schedule` (`name`, `decription`, `event_id`) VALUES ('Orientation Morning', 'For new students', 1);
INSERT INTO `mydb`.`schedule` (`name`, `decription`, `event_id`) VALUES ('Science Fair Day', 'Bring projects', 2);

ALTER TABLE `mydb`.`user` 
ADD COLUMN `password` VARCHAR(45) NOT NULL AFTER `role_id`;
update `mydb`.`user` set password=test;