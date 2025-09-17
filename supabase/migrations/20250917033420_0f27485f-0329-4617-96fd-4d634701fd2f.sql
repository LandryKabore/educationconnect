-- Create teaching assignments for Emile Kabore who missed them during account creation
-- First get the teacher's auth user ID and school's active academic year

DO $$
DECLARE
    teacher_auth_id UUID;
    school_id_val UUID;
    academic_year_id_val UUID;
    class_section_id_val UUID;
    subject_id_val UUID;
BEGIN
    -- Get teacher's auth user ID and school
    SELECT tp.user_id, tp.school_id 
    INTO teacher_auth_id, school_id_val
    FROM teacher_profiles tp 
    JOIN profiles p ON tp.user_id = p.user_id 
    WHERE p.first_name = 'Emile' AND p.last_name = 'Kabore' AND tp.username = 'emile.kabore1';
    
    IF teacher_auth_id IS NULL THEN
        RAISE NOTICE 'Teacher Emile Kabore not found';
        RETURN;
    END IF;
    
    -- Get active academic year for this school
    SELECT id INTO academic_year_id_val
    FROM academic_years 
    WHERE school_id = school_id_val AND active = true
    LIMIT 1;
    
    IF academic_year_id_val IS NULL THEN
        RAISE NOTICE 'No active academic year found for school';
        RETURN;
    END IF;
    
    -- Get a class section (first one available for this school)
    SELECT id INTO class_section_id_val
    FROM class_sections 
    WHERE school_id = school_id_val AND academic_year_id = academic_year_id_val
    LIMIT 1;
    
    -- Get a subject (first one available for this school)
    SELECT id INTO subject_id_val
    FROM subjects 
    WHERE school_id = school_id_val
    LIMIT 1;
    
    -- Create teaching assignment if both class and subject exist
    IF class_section_id_val IS NOT NULL AND subject_id_val IS NOT NULL THEN
        INSERT INTO teaching_assignments (
            teacher_user_id,
            class_section_id,
            subject_id,
            academic_year_id
        ) VALUES (
            teacher_auth_id,
            class_section_id_val,
            subject_id_val,
            academic_year_id_val
        );
        
        RAISE NOTICE 'Created teaching assignment for Emile Kabore: % - % - %', teacher_auth_id, class_section_id_val, subject_id_val;
    ELSE
        RAISE NOTICE 'Could not create assignment - class or subject not found';
    END IF;
END $$;