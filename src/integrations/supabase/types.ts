export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      academic_years: {
        Row: {
          active: boolean | null
          created_at: string
          end_date: string
          id: string
          name: string
          school_id: string
          start_date: string
          updated_at: string
        }
        Insert: {
          active?: boolean | null
          created_at?: string
          end_date: string
          id?: string
          name: string
          school_id: string
          start_date: string
          updated_at?: string
        }
        Update: {
          active?: boolean | null
          created_at?: string
          end_date?: string
          id?: string
          name?: string
          school_id?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_years_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          audience: string
          body: string
          class_section_id: string | null
          created_at: string
          created_by: string
          id: string
          school_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          audience?: string
          body: string
          class_section_id?: string | null
          created_at?: string
          created_by: string
          id?: string
          school_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          audience?: string
          body?: string
          class_section_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          school_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_class_section_id_fkey"
            columns: ["class_section_id"]
            isOneToOne: false
            referencedRelation: "class_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "announcements_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      assignments: {
        Row: {
          class_id: string
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          max_points: number | null
          subject_id: string | null
          teacher_id: string
          title: string
          updated_at: string
        }
        Insert: {
          class_id: string
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          max_points?: number | null
          subject_id?: string | null
          teacher_id: string
          title: string
          updated_at?: string
        }
        Update: {
          class_id?: string
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          max_points?: number | null
          subject_id?: string | null
          teacher_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      attendance: {
        Row: {
          class_id: string
          created_at: string
          date: string
          id: string
          notes: string | null
          recorded_by: string | null
          status: string
          student_id: string
          updated_at: string
        }
        Insert: {
          class_id: string
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          recorded_by?: string | null
          status?: string
          student_id: string
          updated_at?: string
        }
        Update: {
          class_id?: string
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          recorded_by?: string | null
          status?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      campuses: {
        Row: {
          address: string | null
          created_at: string
          id: string
          name: string
          school_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          name: string
          school_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          name?: string
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campuses_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      class_section_subjects: {
        Row: {
          class_section_id: string
          created_at: string | null
          id: string
          subject_id: string
          teacher_user_id: string | null
          updated_at: string | null
        }
        Insert: {
          class_section_id: string
          created_at?: string | null
          id?: string
          subject_id: string
          teacher_user_id?: string | null
          updated_at?: string | null
        }
        Update: {
          class_section_id?: string
          created_at?: string | null
          id?: string
          subject_id?: string
          teacher_user_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "class_section_subjects_class_section_id_fkey"
            columns: ["class_section_id"]
            isOneToOne: false
            referencedRelation: "class_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_section_subjects_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      class_sections: {
        Row: {
          academic_year_id: string
          campus_id: string
          capacity: number | null
          created_at: string
          grade_level: string
          id: string
          name: string
          school_id: string
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          campus_id: string
          capacity?: number | null
          created_at?: string
          grade_level: string
          id?: string
          name: string
          school_id: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          campus_id?: string
          capacity?: number | null
          created_at?: string
          grade_level?: string
          id?: string
          name?: string
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_sections_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_sections_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_sections_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          created_at: string
          grade_level: string | null
          id: string
          name: string
          school_id: string
          teacher_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          grade_level?: string | null
          id?: string
          name: string
          school_id: string
          teacher_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          grade_level?: string | null
          id?: string
          name?: string
          school_id?: string
          teacher_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "classes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      enhanced_attendance: {
        Row: {
          class_section_id: string
          created_at: string
          date: string
          device_timestamp: string | null
          id: string
          notes: string | null
          status: string
          student_user_id: string
          synced: boolean | null
          taken_by: string
          updated_at: string
        }
        Insert: {
          class_section_id: string
          created_at?: string
          date: string
          device_timestamp?: string | null
          id?: string
          notes?: string | null
          status?: string
          student_user_id: string
          synced?: boolean | null
          taken_by: string
          updated_at?: string
        }
        Update: {
          class_section_id?: string
          created_at?: string
          date?: string
          device_timestamp?: string | null
          id?: string
          notes?: string | null
          status?: string
          student_user_id?: string
          synced?: boolean | null
          taken_by?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "enhanced_attendance_class_section_id_fkey"
            columns: ["class_section_id"]
            isOneToOne: false
            referencedRelation: "class_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enhanced_attendance_student_user_id_fkey"
            columns: ["student_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "enhanced_attendance_taken_by_fkey"
            columns: ["taken_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      enhanced_grades: {
        Row: {
          comment: string | null
          created_at: string
          exam_id: string
          graded_by: string
          id: string
          max_score: number
          score: number
          student_user_id: string
          updated_at: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          exam_id: string
          graded_by: string
          id?: string
          max_score: number
          score: number
          student_user_id: string
          updated_at?: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          exam_id?: string
          graded_by?: string
          id?: string
          max_score?: number
          score?: number
          student_user_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "enhanced_grades_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enhanced_grades_graded_by_fkey"
            columns: ["graded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "enhanced_grades_student_user_id_fkey"
            columns: ["student_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      enrollments: {
        Row: {
          academic_year_id: string
          class_section_id: string
          created_at: string
          date_enrolled: string | null
          id: string
          status: string | null
          student_user_id: string
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          class_section_id: string
          created_at?: string
          date_enrolled?: string | null
          id?: string
          status?: string | null
          student_user_id: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          class_section_id?: string
          created_at?: string
          date_enrolled?: string | null
          id?: string
          status?: string | null
          student_user_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_class_section_id_fkey"
            columns: ["class_section_id"]
            isOneToOne: false
            referencedRelation: "class_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_student_user_id_fkey"
            columns: ["student_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      exams: {
        Row: {
          class_section_id: string
          created_at: string
          created_by: string
          exam_date: string
          id: string
          max_score: number | null
          subject_id: string
          term: string | null
          title: string
          updated_at: string
          weight: number | null
        }
        Insert: {
          class_section_id: string
          created_at?: string
          created_by: string
          exam_date: string
          id?: string
          max_score?: number | null
          subject_id: string
          term?: string | null
          title: string
          updated_at?: string
          weight?: number | null
        }
        Update: {
          class_section_id?: string
          created_at?: string
          created_by?: string
          exam_date?: string
          id?: string
          max_score?: number | null
          subject_id?: string
          term?: string | null
          title?: string
          updated_at?: string
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "exams_class_section_id_fkey"
            columns: ["class_section_id"]
            isOneToOne: false
            referencedRelation: "class_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "exams_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      grades: {
        Row: {
          assignment_id: string
          created_at: string
          feedback: string | null
          graded_at: string | null
          id: string
          points_earned: number | null
          student_id: string
          updated_at: string
        }
        Insert: {
          assignment_id: string
          created_at?: string
          feedback?: string | null
          graded_at?: string | null
          id?: string
          points_earned?: number | null
          student_id: string
          updated_at?: string
        }
        Update: {
          assignment_id?: string
          created_at?: string
          feedback?: string | null
          graded_at?: string | null
          id?: string
          points_earned?: number | null
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grades_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      magic_links: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          token: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          token: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          token?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          attachments: string[] | null
          body: string
          created_at: string
          id: string
          read_at: string | null
          recipient_user_id: string
          sender_user_id: string
          subject: string | null
          updated_at: string
        }
        Insert: {
          attachments?: string[] | null
          body: string
          created_at?: string
          id?: string
          read_at?: string | null
          recipient_user_id: string
          sender_user_id: string
          subject?: string | null
          updated_at?: string
        }
        Update: {
          attachments?: string[] | null
          body?: string
          created_at?: string
          id?: string
          read_at?: string | null
          recipient_user_id?: string
          sender_user_id?: string
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "messages_sender_user_id_fkey"
            columns: ["sender_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      parent_profiles: {
        Row: {
          created_at: string
          id: string
          relationship_to_student: string | null
          school_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          relationship_to_student?: string | null
          school_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          relationship_to_student?: string | null
          school_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "parent_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      parent_student_links: {
        Row: {
          created_at: string
          id: string
          parent_user_id: string
          status: string | null
          student_user_id: string
          updated_at: string
          verification_code: string | null
          verification_method: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          parent_user_id: string
          status?: string | null
          student_user_id: string
          updated_at?: string
          verification_code?: string | null
          verification_method?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          parent_user_id?: string
          status?: string | null
          student_user_id?: string
          updated_at?: string
          verification_code?: string | null
          verification_method?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parent_student_links_parent_user_id_fkey"
            columns: ["parent_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "parent_student_links_student_user_id_fkey"
            columns: ["student_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          first_name: string | null
          id: string
          language_pref: string | null
          last_name: string | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          status: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          first_name?: string | null
          id?: string
          language_pref?: string | null
          last_name?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          status?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          first_name?: string | null
          id?: string
          language_pref?: string | null
          last_name?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          status?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      resources: {
        Row: {
          class_section_id: string
          created_at: string
          description: string | null
          file_url: string | null
          id: string
          subject_id: string
          title: string
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          class_section_id: string
          created_at?: string
          description?: string | null
          file_url?: string | null
          id?: string
          subject_id: string
          title: string
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          class_section_id?: string
          created_at?: string
          description?: string | null
          file_url?: string | null
          id?: string
          subject_id?: string
          title?: string
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "resources_class_section_id_fkey"
            columns: ["class_section_id"]
            isOneToOne: false
            referencedRelation: "class_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resources_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resources_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      schools: {
        Row: {
          active: boolean | null
          address: string | null
          country: string | null
          created_at: string
          email: string | null
          id: string
          languages: string[] | null
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean | null
          address?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          id?: string
          languages?: string[] | null
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean | null
          address?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          id?: string
          languages?: string[] | null
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      student_profiles: {
        Row: {
          created_at: string
          dob: string | null
          gender: string | null
          guardian_primary_contact: string | null
          id: string
          school_id: string
          student_no: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dob?: string | null
          gender?: string | null
          guardian_primary_contact?: string | null
          id?: string
          school_id: string
          student_no?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          dob?: string | null
          gender?: string | null
          guardian_primary_contact?: string | null
          id?: string
          school_id?: string
          student_no?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_profiles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      study_group_members: {
        Row: {
          created_at: string
          id: string
          role: string
          study_group_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: string
          study_group_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          study_group_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_group_members_study_group_id_fkey"
            columns: ["study_group_id"]
            isOneToOne: false
            referencedRelation: "study_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_group_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      study_groups: {
        Row: {
          class_section_id: string
          created_at: string
          description: string | null
          id: string
          moderated_by_teacher_id: string
          name: string
          subject_id: string
          updated_at: string
        }
        Insert: {
          class_section_id: string
          created_at?: string
          description?: string | null
          id?: string
          moderated_by_teacher_id: string
          name: string
          subject_id: string
          updated_at?: string
        }
        Update: {
          class_section_id?: string
          created_at?: string
          description?: string | null
          id?: string
          moderated_by_teacher_id?: string
          name?: string
          subject_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_groups_class_section_id_fkey"
            columns: ["class_section_id"]
            isOneToOne: false
            referencedRelation: "class_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_groups_moderated_by_teacher_id_fkey"
            columns: ["moderated_by_teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "study_groups_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          code: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          schedule_days: string[] | null
          schedule_duration: number | null
          schedule_time_end: string | null
          schedule_time_start: string | null
          school_id: string | null
        }
        Insert: {
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          schedule_days?: string[] | null
          schedule_duration?: number | null
          schedule_time_end?: string | null
          schedule_time_start?: string | null
          school_id?: string | null
        }
        Update: {
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          schedule_days?: string[] | null
          schedule_duration?: number | null
          schedule_time_end?: string | null
          schedule_time_start?: string | null
          school_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subjects_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_profiles: {
        Row: {
          created_at: string
          hire_date: string | null
          id: string
          last_magic_link_sent: string | null
          phone: string | null
          pin_hash: string | null
          pin_set_at: string | null
          qualifications: string[] | null
          school_id: string
          staff_no: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          hire_date?: string | null
          id?: string
          last_magic_link_sent?: string | null
          phone?: string | null
          pin_hash?: string | null
          pin_set_at?: string | null
          qualifications?: string[] | null
          school_id: string
          staff_no?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          hire_date?: string | null
          id?: string
          last_magic_link_sent?: string | null
          phone?: string | null
          pin_hash?: string | null
          pin_set_at?: string | null
          qualifications?: string[] | null
          school_id?: string
          staff_no?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_profiles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      teaching_assignments: {
        Row: {
          academic_year_id: string
          class_section_id: string
          created_at: string
          id: string
          subject_id: string
          teacher_user_id: string
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          class_section_id: string
          created_at?: string
          id?: string
          subject_id: string
          teacher_user_id: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          class_section_id?: string
          created_at?: string
          id?: string
          subject_id?: string
          teacher_user_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teaching_assignments_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teaching_assignments_class_section_id_fkey"
            columns: ["class_section_id"]
            isOneToOne: false
            referencedRelation: "class_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teaching_assignments_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teaching_assignments_teacher_user_id_fkey"
            columns: ["teacher_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      user_roles: {
        Row: {
          active: boolean | null
          assigned_at: string | null
          assigned_by: string | null
          created_at: string | null
          id: string
          role: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          active?: boolean | null
          assigned_at?: string | null
          assigned_by?: string | null
          created_at?: string | null
          id?: string
          role: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          active?: boolean | null
          assigned_at?: string | null
          assigned_by?: string | null
          created_at?: string | null
          id?: string
          role?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_magic_link: {
        Args: { teacher_user_id: string }
        Returns: string
      }
      is_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      is_parent: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      is_student: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      is_teacher: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      verify_magic_link_and_set_pin: {
        Args: { new_pin: string; token_value: string }
        Returns: Json
      }
    }
    Enums: {
      user_role: "parent" | "teacher" | "student" | "admin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      user_role: ["parent", "teacher", "student", "admin"],
    },
  },
} as const
