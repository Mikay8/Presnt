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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      org_locations: {
        Row: {
          id:            string
          org_id:        string
          name:          string
          address:       string | null
          latitude:      number | null
          longitude:     number | null
          radius_meters: number | null
          is_deleted:    boolean | null
          created_by:    string | null
          created_at:    string | null
          updated_at:    string | null
        }
        Insert: {
          id?:           string
          org_id:        string
          name:          string
          address?:      string | null
          latitude?:     number | null
          longitude?:    number | null
          radius_meters?: number | null
          is_deleted?:   boolean | null
          created_by?:   string | null
          created_at?:   string | null
          updated_at?:   string | null
        }
        Update: {
          id?:           string
          org_id?:       string
          name?:         string
          address?:      string | null
          latitude?:     number | null
          longitude?:    number | null
          radius_meters?: number | null
          is_deleted?:   boolean | null
          created_by?:   string | null
          created_at?:   string | null
          updated_at?:   string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_locations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_locations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      api_request_log: {
        Row: {
          id:            string
          created_at:    string
          user_id:       string | null
          org_id:        string | null
          method:        string
          endpoint:      string
          domain:        string
          status:        string
          status_code:   number | null
          duration_ms:   number | null
          request_body:  Record<string, unknown> | null
          response_meta: Record<string, unknown> | null
          error_message: string | null
        }
        Insert: {
          id?:           string
          created_at?:   string
          user_id?:      string | null
          org_id?:       string | null
          method:        string
          endpoint:      string
          domain?:       string
          status?:       string
          status_code?:  number | null
          duration_ms?:  number | null
          request_body?: Record<string, unknown> | null
          response_meta?: Record<string, unknown> | null
          error_message?: string | null
        }
        Update: {
          id?:           string
          created_at?:   string
          user_id?:      string | null
          org_id?:       string | null
          method?:       string
          endpoint?:     string
          domain?:       string
          status?:       string
          status_code?:  number | null
          duration_ms?:  number | null
          request_body?: Record<string, unknown> | null
          response_meta?: Record<string, unknown> | null
          error_message?: string | null
        }
        Relationships: []
      }
      academic_terms: {
        Row: {
          created_at: string | null
          end_date: string
          id: string
          is_active: boolean | null
          name: string
          org_id: string
          start_date: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          end_date: string
          id?: string
          is_active?: boolean | null
          name: string
          org_id: string
          start_date: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          end_date?: string
          id?: string
          is_active?: boolean | null
          name?: string
          org_id?: string
          start_date?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "academic_terms_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          author_id: string
          body: string
          created_at: string | null
          id: string
          is_deleted: boolean | null
          is_pinned: boolean | null
          org_id: string
          title: string
          updated_at: string | null
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string | null
          id?: string
          is_deleted?: boolean | null
          is_pinned?: boolean | null
          org_id: string
          title: string
          updated_at?: string | null
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string | null
          id?: string
          is_deleted?: boolean | null
          is_pinned?: boolean | null
          org_id?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "announcements_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      event_attendance: {
        Row: {
          check_in_method: string | null
          checked_in_at: string | null
          created_at: string | null
          event_id: string
          id: string
          notes: string | null
          org_id: string
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          check_in_method?: string | null
          checked_in_at?: string | null
          created_at?: string | null
          event_id: string
          id?: string
          notes?: string | null
          org_id: string
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          check_in_method?: string | null
          checked_in_at?: string | null
          created_at?: string | null
          event_id?: string
          id?: string
          notes?: string | null
          org_id?: string
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_attendance_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_attendance_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_attendance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          allow_excuses:         boolean | null
          checkin_grace_minutes: number | null
          checkin_open_minutes:  number | null
          created_at:            string | null
          created_by:            string | null
          description:           string | null
          end_time:              string | null
          event_code:            string | null
          geofence_required:     boolean | null
          id:                    string
          is_cancelled:          boolean | null
          is_deleted:            boolean | null
          is_mandatory:          boolean | null
          is_occurrence:         boolean
          location:              string | null
          location_id:           string | null
          location_lat:          number | null
          location_lng:          number | null
          max_capacity:          number | null
          meeting_url:           string | null
          occurrence_index:      number | null
          occurrences_horizon:   string | null
          org_id:                string
          parent_event_id:       string | null
          points:                number | null
          qr_checkin:            boolean | null
          recurrence_rule:       string | null
          rsvp_required:         boolean | null
          start_time:            string
          title:                 string
          type:                  string
          updated_at:            string | null
        }
        Insert: {
          allow_excuses?:         boolean | null
          checkin_grace_minutes?: number | null
          checkin_open_minutes?:  number | null
          created_at?:            string | null
          created_by?:            string | null
          description?:           string | null
          end_time?:              string | null
          event_code?:            string | null
          geofence_required?:     boolean | null
          id?:                    string
          is_cancelled?:          boolean | null
          is_deleted?:            boolean | null
          is_mandatory?:          boolean | null
          is_occurrence?:         boolean
          location?:              string | null
          location_id?:           string | null
          location_lat?:          number | null
          location_lng?:          number | null
          max_capacity?:          number | null
          meeting_url?:           string | null
          occurrence_index?:      number | null
          occurrences_horizon?:   string | null
          org_id:                 string
          parent_event_id?:       string | null
          points?:                number | null
          qr_checkin?:            boolean | null
          recurrence_rule?:       string | null
          rsvp_required?:         boolean | null
          start_time:             string
          title:                  string
          type?:                  string
          updated_at?:            string | null
        }
        Update: {
          allow_excuses?:         boolean | null
          checkin_grace_minutes?: number | null
          checkin_open_minutes?:  number | null
          created_at?:            string | null
          created_by?:            string | null
          description?:           string | null
          end_time?:              string | null
          event_code?:            string | null
          geofence_required?:     boolean | null
          id?:                    string
          is_cancelled?:          boolean | null
          is_deleted?:            boolean | null
          is_mandatory?:          boolean | null
          is_occurrence?:         boolean
          location?:              string | null
          location_id?:           string | null
          location_lat?:          number | null
          location_lng?:          number | null
          max_capacity?:          number | null
          meeting_url?:           string | null
          occurrence_index?:      number | null
          occurrences_horizon?:   string | null
          org_id?:                string
          parent_event_id?:       string | null
          points?:                number | null
          qr_checkin?:            boolean | null
          recurrence_rule?:       string | null
          rsvp_required?:         boolean | null
          start_time?:            string
          title?:                 string
          type?:                  string
          updated_at?:            string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "org_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_parent_event_id_fkey"
            columns: ["parent_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      excuses: {
        Row: {
          admin_notes: string | null
          created_at: string | null
          event_id: string
          id: string
          org_id: string
          reason: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string | null
          event_id: string
          id?: string
          org_id: string
          reason: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          created_at?: string | null
          event_id?: string
          id?: string
          org_id?: string
          reason?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "excuses_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "excuses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "excuses_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "excuses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_class_members: {
        Row: {
          class_id: string
          created_at: string | null
          id: string
          membership_id: string
        }
        Insert: {
          class_id: string
          created_at?: string | null
          id?: string
          membership_id: string
        }
        Update: {
          class_id?: string
          created_at?: string | null
          id?: string
          membership_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_class_members_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "membership_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_class_members_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_classes: {
        Row: {
          created_at: string | null
          id: string
          name: string
          org_id: string
          term_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          org_id: string
          term_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          org_id?: string
          term_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "membership_classes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_classes_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "academic_terms"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          block_reason: string | null
          blocked_at: string | null
          blocked_by: string | null
          can_attend_events: boolean | null
          can_rsvp_events: boolean | null
          can_submit_excuses: boolean | null
          can_view_calendar: boolean | null
          created_at: string | null
          custom_role_id: string | null
          deleted_at: string | null
          dues_balance: number | null
          dues_hold: boolean | null
          dues_hold_since: string | null
          dues_hold_threshold: number | null
          dues_last_paid_at: string | null
          dues_status: string
          graduated_at: string | null
          id: string
          initiated_at: string | null
          is_blocked: boolean | null
          is_deleted: boolean | null
          is_visible: boolean | null
          joined_at: string | null
          member_number: string | null
          org_id: string
          pin_number: string | null
          role: string
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          block_reason?: string | null
          blocked_at?: string | null
          blocked_by?: string | null
          can_attend_events?: boolean | null
          can_rsvp_events?: boolean | null
          can_submit_excuses?: boolean | null
          can_view_calendar?: boolean | null
          created_at?: string | null
          custom_role_id?: string | null
          deleted_at?: string | null
          dues_balance?: number | null
          dues_hold?: boolean | null
          dues_hold_since?: string | null
          dues_hold_threshold?: number | null
          dues_last_paid_at?: string | null
          dues_status?: string
          graduated_at?: string | null
          id?: string
          initiated_at?: string | null
          is_blocked?: boolean | null
          is_deleted?: boolean | null
          is_visible?: boolean | null
          joined_at?: string | null
          member_number?: string | null
          org_id: string
          pin_number?: string | null
          role?: string
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          block_reason?: string | null
          blocked_at?: string | null
          blocked_by?: string | null
          can_attend_events?: boolean | null
          can_rsvp_events?: boolean | null
          can_submit_excuses?: boolean | null
          can_view_calendar?: boolean | null
          created_at?: string | null
          custom_role_id?: string | null
          deleted_at?: string | null
          dues_balance?: number | null
          dues_hold?: boolean | null
          dues_hold_since?: string | null
          dues_hold_threshold?: number | null
          dues_last_paid_at?: string | null
          dues_status?: string
          graduated_at?: string | null
          id?: string
          initiated_at?: string | null
          is_blocked?: boolean | null
          is_deleted?: boolean | null
          is_visible?: boolean | null
          joined_at?: string | null
          member_number?: string | null
          org_id?: string
          pin_number?: string | null
          role?: string
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_blocked_by_fkey"
            columns: ["blocked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_custom_role_id_fkey"
            columns: ["custom_role_id"]
            isOneToOne: false
            referencedRelation: "org_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      org_branding_history: {
        Row: {
          changed_at: string | null
          changed_by: string | null
          id: string
          new_values: Json
          org_id: string
          previous_values: Json
        }
        Insert: {
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          new_values: Json
          org_id: string
          previous_values: Json
        }
        Update: {
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          new_values?: Json
          org_id?: string
          previous_values?: Json
        }
        Relationships: [
          {
            foreignKeyName: "fk_branding_history_changed_by"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_branding_history_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_roles: {
        Row: {
          color: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          org_id: string
          permissions: string[]
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          org_id: string
          permissions?: string[]
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          org_id?: string
          permissions?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_roles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_roles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          accent_color: string | null
          app_display_name: string | null
          background_color: string | null
          banner_url: string | null
          color_scheme: string | null
          created_at: string | null
          created_by: string | null
          custom_font: string | null
          deleted_at: string | null
          founding_year: number | null
          greek_letter_org: string | null
          id: string
          institution: string | null
          is_active: boolean | null
          is_deleted: boolean | null
          join_code: string | null
          logo_url: string | null
          name: string
          parent_org_id: string | null
          primary_color: string | null
          secondary_color: string | null
          slug: string
          stripe_customer_id: string | null
          subscription_status: string | null
          subscription_tier: string | null
          text_color: string | null
          timezone: string
          type: string
          updated_at: string | null
        }
        Insert: {
          accent_color?: string | null
          app_display_name?: string | null
          background_color?: string | null
          banner_url?: string | null
          color_scheme?: string | null
          created_at?: string | null
          created_by?: string | null
          custom_font?: string | null
          deleted_at?: string | null
          founding_year?: number | null
          greek_letter_org?: string | null
          id?: string
          institution?: string | null
          is_active?: boolean | null
          is_deleted?: boolean | null
          join_code?: string | null
          logo_url?: string | null
          name: string
          parent_org_id?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          slug: string
          stripe_customer_id?: string | null
          subscription_status?: string | null
          subscription_tier?: string | null
          text_color?: string | null
          timezone?: string
          type: string
          updated_at?: string | null
        }
        Update: {
          accent_color?: string | null
          app_display_name?: string | null
          background_color?: string | null
          banner_url?: string | null
          color_scheme?: string | null
          created_at?: string | null
          created_by?: string | null
          custom_font?: string | null
          deleted_at?: string | null
          founding_year?: number | null
          greek_letter_org?: string | null
          id?: string
          institution?: string | null
          is_active?: boolean | null
          is_deleted?: boolean | null
          join_code?: string | null
          logo_url?: string | null
          name?: string
          parent_org_id?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          slug?: string
          stripe_customer_id?: string | null
          subscription_status?: string | null
          subscription_tier?: string | null
          text_color?: string | null
          timezone?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organizations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizations_parent_org_id_fkey"
            columns: ["parent_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_config: {
        Row: {
          description: string | null
          key: string
          updated_at: string | null
          updated_by: string | null
          value: string
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string | null
          updated_by?: string | null
          value: string
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string | null
          updated_by?: string | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_config_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          email: string
          first_name: string
          graduation_year: number | null
          id: string
          is_superuser: boolean | null
          last_name: string
          major: string | null
          notification_prefs: Json | null
          phone: string | null
          push_token: string | null
          superuser_since: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          email: string
          first_name: string
          graduation_year?: number | null
          id: string
          is_superuser?: boolean | null
          last_name: string
          major?: string | null
          notification_prefs?: Json | null
          phone?: string | null
          push_token?: string | null
          superuser_since?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          email?: string
          first_name?: string
          graduation_year?: number | null
          id?: string
          is_superuser?: boolean | null
          last_name?: string
          major?: string | null
          notification_prefs?: Json | null
          phone?: string | null
          push_token?: string | null
          superuser_since?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      rsvps: {
        Row: {
          created_at: string | null
          event_id: string
          id: string
          org_id: string
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          event_id: string
          id?: string
          org_id: string
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          event_id?: string
          id?: string
          org_id?: string
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rsvps_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rsvps_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rsvps_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      superuser_audit_log: {
        Row: {
          action: string
          created_at: string | null
          id: string
          ip_address: unknown
          new_value: Json | null
          notes: string | null
          performed_by: string
          previous_value: Json | null
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          ip_address?: unknown
          new_value?: Json | null
          notes?: string | null
          performed_by: string
          previous_value?: Json | null
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          ip_address?: unknown
          new_value?: Json | null
          notes?: string | null
          performed_by?: string
          previous_value?: Json | null
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "superuser_audit_log_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      clear_api_request_log: {
        Args: { older_than_hours?: number | null }
        Returns: number
      }
      expand_recurring_event: {
        Args: { p_event_id: string; batch_size?: number }
        Returns: number
      }
      generate_event_code: {
        Args: { p_org_id: string; p_type: string; p_start: string }
        Returns: string
      }
      is_org_member: { Args: { check_org_id: string }; Returns: boolean }
      is_superuser: { Args: never; Returns: boolean }
      topup_recurring_events: {
        Args: { p_org_id: string; lookahead_days?: number }
        Returns: number
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
