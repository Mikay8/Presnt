export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
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
      organizations: {
        Row: {
          accent_color: string | null
          app_display_name: string | null
          background_color: string | null
          banner_url: string | null
          color_scheme: string | null
          created_at: string | null
          custom_font: string | null
          deleted_at: string | null
          founding_year: number | null
          greek_letter_org: string | null
          id: string
          institution: string | null
          is_active: boolean | null
          is_deleted: boolean | null
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
          custom_font?: string | null
          deleted_at?: string | null
          founding_year?: number | null
          greek_letter_org?: string | null
          id?: string
          institution?: string | null
          is_active?: boolean | null
          is_deleted?: boolean | null
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
          custom_font?: string | null
          deleted_at?: string | null
          founding_year?: number | null
          greek_letter_org?: string | null
          id?: string
          institution?: string | null
          is_active?: boolean | null
          is_deleted?: boolean | null
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
            foreignKeyName: "organizations_parent_org_id_fkey"
            columns: ["parent_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_superuser: { Args: never; Returns: boolean }
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
