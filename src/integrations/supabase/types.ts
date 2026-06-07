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
      purity_activity_log: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          user_id: string | null
          username: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          user_id?: string | null
          username: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          user_id?: string | null
          username?: string
        }
        Relationships: []
      }
      purity_clients: {
        Row: {
          created_at: string
          id: string
          name: string
          notes: string | null
          phone: string | null
          purity_format: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          purity_format?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          purity_format?: string
          user_id?: string | null
        }
        Relationships: []
      }
      purity_pieces: {
        Row: {
          bafleh_purity: number | null
          checked: boolean
          client_id: string | null
          created_at: string
          id: string
          initial_purity: number | null
          label: string | null
          trip_id: string
          user_id: string
          weight_grams: number
        }
        Insert: {
          bafleh_purity?: number | null
          checked?: boolean
          client_id?: string | null
          created_at?: string
          id?: string
          initial_purity?: number | null
          label?: string | null
          trip_id: string
          user_id: string
          weight_grams: number
        }
        Update: {
          bafleh_purity?: number | null
          checked?: boolean
          client_id?: string | null
          created_at?: string
          id?: string
          initial_purity?: number | null
          label?: string | null
          trip_id?: string
          user_id?: string
          weight_grams?: number
        }
        Relationships: [
          {
            foreignKeyName: "purity_pieces_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "purity_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purity_pieces_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "purity_trips"
            referencedColumns: ["id"]
          },
        ]
      }
      purity_profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          username: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          username: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          username?: string
        }
        Relationships: []
      }
      purity_trips: {
        Row: {
          actual_purity: number | null
          arrival_date: string | null
          created_at: string
          declared_purity: number
          departure_date: string
          id: string
          is_settled: boolean
          name: string | null
          notes: string | null
          receiver_company: string | null
          scrap_weight: number | null
          user_id: string | null
        }
        Insert: {
          actual_purity?: number | null
          arrival_date?: string | null
          created_at?: string
          declared_purity?: number
          departure_date: string
          id?: string
          is_settled?: boolean
          name?: string | null
          notes?: string | null
          receiver_company?: string | null
          scrap_weight?: number | null
          user_id?: string | null
        }
        Update: {
          actual_purity?: number | null
          arrival_date?: string | null
          created_at?: string
          declared_purity?: number
          departure_date?: string
          id?: string
          is_settled?: boolean
          name?: string | null
          notes?: string | null
          receiver_company?: string | null
          scrap_weight?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      refineries: {
        Row: {
          created_at: string
          id: string
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      refinery_clients: {
        Row: {
          created_at: string
          da_balance: number
          id: string
          name: string
          notes: string | null
          phone: string | null
          purity_balance: number
          refinery_id: string
          refining_fee_price: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          da_balance?: number
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          purity_balance?: number
          refinery_id: string
          refining_fee_price?: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          da_balance?: number
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          purity_balance?: number
          refinery_id?: string
          refining_fee_price?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "refinery_clients_refinery_id_fkey"
            columns: ["refinery_id"]
            isOneToOne: false
            referencedRelation: "refineries"
            referencedColumns: ["id"]
          },
        ]
      }
      refinery_report_history: {
        Row: {
          channel: string
          created_at: string
          date_from: string
          date_to: string
          details: Json | null
          format: string
          generated_by: string | null
          generated_by_username: string | null
          id: string
          refinery_id: string
          report_type: string
          statement_number: string | null
        }
        Insert: {
          channel?: string
          created_at?: string
          date_from: string
          date_to: string
          details?: Json | null
          format: string
          generated_by?: string | null
          generated_by_username?: string | null
          id?: string
          refinery_id: string
          report_type?: string
          statement_number?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          date_from?: string
          date_to?: string
          details?: Json | null
          format?: string
          generated_by?: string | null
          generated_by_username?: string | null
          id?: string
          refinery_id?: string
          report_type?: string
          statement_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "refinery_report_history_refinery_id_fkey"
            columns: ["refinery_id"]
            isOneToOne: false
            referencedRelation: "refineries"
            referencedColumns: ["id"]
          },
        ]
      }
      refinery_stock: {
        Row: {
          da_stock: number
          id: string
          pure_gold_stock: number
          refinery_id: string
          updated_at: string
        }
        Insert: {
          da_stock?: number
          id?: string
          pure_gold_stock?: number
          refinery_id: string
          updated_at?: string
        }
        Update: {
          da_stock?: number
          id?: string
          pure_gold_stock?: number
          refinery_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "refinery_stock_refinery_id_fkey"
            columns: ["refinery_id"]
            isOneToOne: true
            referencedRelation: "refineries"
            referencedColumns: ["id"]
          },
        ]
      }
      refinery_stock_movements: {
        Row: {
          client_id: string | null
          created_at: string
          created_by: string | null
          da_change: number
          da_stock_after: number
          da_stock_before: number
          gold_change: number
          gold_stock_after: number
          gold_stock_before: number
          id: string
          movement_type: Database["public"]["Enums"]["refinery_movement_type"]
          notes: string | null
          refinery_id: string
          transaction_id: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          da_change?: number
          da_stock_after?: number
          da_stock_before?: number
          gold_change?: number
          gold_stock_after?: number
          gold_stock_before?: number
          id?: string
          movement_type: Database["public"]["Enums"]["refinery_movement_type"]
          notes?: string | null
          refinery_id: string
          transaction_id?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          da_change?: number
          da_stock_after?: number
          da_stock_before?: number
          gold_change?: number
          gold_stock_after?: number
          gold_stock_before?: number
          id?: string
          movement_type?: Database["public"]["Enums"]["refinery_movement_type"]
          notes?: string | null
          refinery_id?: string
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "refinery_stock_movements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "refinery_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refinery_stock_movements_refinery_id_fkey"
            columns: ["refinery_id"]
            isOneToOne: false
            referencedRelation: "refineries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refinery_stock_movements_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "refinery_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      refinery_transaction_gold_bars: {
        Row: {
          created_at: string
          gross_weight: number
          id: string
          item_number: string | null
          item_type: Database["public"]["Enums"]["refinery_bar_type"]
          pure_weight: number
          purity: number
          transaction_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          gross_weight?: number
          id?: string
          item_number?: string | null
          item_type?: Database["public"]["Enums"]["refinery_bar_type"]
          pure_weight?: number
          purity?: number
          transaction_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          gross_weight?: number
          id?: string
          item_number?: string | null
          item_type?: Database["public"]["Enums"]["refinery_bar_type"]
          pure_weight?: number
          purity?: number
          transaction_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "refinery_transaction_gold_bars_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "refinery_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      refinery_transactions: {
        Row: {
          average_purity: number
          client_id: string
          created_at: string
          created_by: string | null
          da_amount: number
          direction: Database["public"]["Enums"]["refinery_tx_direction"]
          fee_price: number
          id: string
          new_da_balance: number | null
          new_da_stock: number | null
          new_gold_stock: number | null
          new_purity_balance: number | null
          notes: string | null
          previous_da_balance: number | null
          previous_da_stock: number | null
          previous_gold_stock: number | null
          previous_purity_balance: number | null
          refinery_id: string
          settled_at: string | null
          status: Database["public"]["Enums"]["refinery_tx_status"]
          total_gross_weight: number
          total_pure_weight: number
          total_refining_fee: number
          transaction_date: string
          transaction_number: string
          transaction_type: Database["public"]["Enums"]["refinery_tx_type"]
          updated_at: string
        }
        Insert: {
          average_purity?: number
          client_id: string
          created_at?: string
          created_by?: string | null
          da_amount?: number
          direction: Database["public"]["Enums"]["refinery_tx_direction"]
          fee_price?: number
          id?: string
          new_da_balance?: number | null
          new_da_stock?: number | null
          new_gold_stock?: number | null
          new_purity_balance?: number | null
          notes?: string | null
          previous_da_balance?: number | null
          previous_da_stock?: number | null
          previous_gold_stock?: number | null
          previous_purity_balance?: number | null
          refinery_id: string
          settled_at?: string | null
          status?: Database["public"]["Enums"]["refinery_tx_status"]
          total_gross_weight?: number
          total_pure_weight?: number
          total_refining_fee?: number
          transaction_date?: string
          transaction_number: string
          transaction_type: Database["public"]["Enums"]["refinery_tx_type"]
          updated_at?: string
        }
        Update: {
          average_purity?: number
          client_id?: string
          created_at?: string
          created_by?: string | null
          da_amount?: number
          direction?: Database["public"]["Enums"]["refinery_tx_direction"]
          fee_price?: number
          id?: string
          new_da_balance?: number | null
          new_da_stock?: number | null
          new_gold_stock?: number | null
          new_purity_balance?: number | null
          notes?: string | null
          previous_da_balance?: number | null
          previous_da_stock?: number | null
          previous_gold_stock?: number | null
          previous_purity_balance?: number | null
          refinery_id?: string
          settled_at?: string | null
          status?: Database["public"]["Enums"]["refinery_tx_status"]
          total_gross_weight?: number
          total_pure_weight?: number
          total_refining_fee?: number
          transaction_date?: string
          transaction_number?: string
          transaction_type?: Database["public"]["Enums"]["refinery_tx_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "refinery_transactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "refinery_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refinery_transactions_refinery_id_fkey"
            columns: ["refinery_id"]
            isOneToOne: false
            referencedRelation: "refineries"
            referencedColumns: ["id"]
          },
        ]
      }
      refinery_users: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          phone: string | null
          refinery_id: string
          role: Database["public"]["Enums"]["refinery_role"]
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          phone?: string | null
          refinery_id: string
          role?: Database["public"]["Enums"]["refinery_role"]
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          phone?: string | null
          refinery_id?: string
          role?: Database["public"]["Enums"]["refinery_role"]
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "refinery_users_refinery_id_fkey"
            columns: ["refinery_id"]
            isOneToOne: false
            referencedRelation: "refineries"
            referencedColumns: ["id"]
          },
        ]
      }
      swap_activity_log: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string | null
          id: string
          ip_address: string | null
          module: string | null
          new_values: Json | null
          old_values: Json | null
          status: string | null
          user_agent: string | null
          user_id: string
          username: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          module?: string | null
          new_values?: Json | null
          old_values?: Json | null
          status?: string | null
          user_agent?: string | null
          user_id: string
          username: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          module?: string | null
          new_values?: Json | null
          old_values?: Json | null
          status?: string | null
          user_agent?: string | null
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      swap_clients: {
        Row: {
          additional_exposure_pct: number
          annual_rate: number
          code: string
          created_at: string
          created_by: string
          gold_kg: number
          id: string
          margin_requirement_pct: number
          notes: string | null
          position_type: string
          short_annual_rate: number
          updated_at: string
          usd_balance: number
          xauusd_price: number | null
        }
        Insert: {
          additional_exposure_pct?: number
          annual_rate?: number
          code: string
          created_at?: string
          created_by: string
          gold_kg?: number
          id?: string
          margin_requirement_pct?: number
          notes?: string | null
          position_type?: string
          short_annual_rate?: number
          updated_at?: string
          usd_balance?: number
          xauusd_price?: number | null
        }
        Update: {
          additional_exposure_pct?: number
          annual_rate?: number
          code?: string
          created_at?: string
          created_by?: string
          gold_kg?: number
          id?: string
          margin_requirement_pct?: number
          notes?: string | null
          position_type?: string
          short_annual_rate?: number
          updated_at?: string
          usd_balance?: number
          xauusd_price?: number | null
        }
        Relationships: []
      }
      swap_daily_fees: {
        Row: {
          additional_exposure_pct: number
          annual_rate: number
          client_id: string
          created_at: string
          daily_fee: number
          day_multiplier: number | null
          effective_balance: number | null
          fee_date: string
          id: string
          position_type: string
          usd_balance: number
          xauusd_price: number | null
        }
        Insert: {
          additional_exposure_pct?: number
          annual_rate: number
          client_id: string
          created_at?: string
          daily_fee: number
          day_multiplier?: number | null
          effective_balance?: number | null
          fee_date: string
          id?: string
          position_type?: string
          usd_balance: number
          xauusd_price?: number | null
        }
        Update: {
          additional_exposure_pct?: number
          annual_rate?: number
          client_id?: string
          created_at?: string
          daily_fee?: number
          day_multiplier?: number | null
          effective_balance?: number | null
          fee_date?: string
          id?: string
          position_type?: string
          usd_balance?: number
          xauusd_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "swap_daily_fees_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "swap_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      swap_entries: {
        Row: {
          annual_rate: number
          client_name: string
          created_at: string
          end_date: string | null
          id: string
          notes: string | null
          start_date: string
          usd_amount: number
          user_id: string
        }
        Insert: {
          annual_rate?: number
          client_name: string
          created_at?: string
          end_date?: string | null
          id?: string
          notes?: string | null
          start_date?: string
          usd_amount: number
          user_id: string
        }
        Update: {
          annual_rate?: number
          client_name?: string
          created_at?: string
          end_date?: string | null
          id?: string
          notes?: string | null
          start_date?: string
          usd_amount?: number
          user_id?: string
        }
        Relationships: []
      }
      swap_margin_history: {
        Row: {
          changed_field: string
          client_id: string
          created_at: string
          id: string
          new_available_margin: number | null
          new_gold_kg: number | null
          new_margin_pct: number | null
          new_required_margin: number | null
          new_status: string | null
          new_usd_balance: number | null
          new_xauusd_price: number | null
          old_available_margin: number | null
          old_gold_kg: number | null
          old_margin_pct: number | null
          old_required_margin: number | null
          old_status: string | null
          old_usd_balance: number | null
          old_xauusd_price: number | null
          user_id: string
          username: string
        }
        Insert: {
          changed_field: string
          client_id: string
          created_at?: string
          id?: string
          new_available_margin?: number | null
          new_gold_kg?: number | null
          new_margin_pct?: number | null
          new_required_margin?: number | null
          new_status?: string | null
          new_usd_balance?: number | null
          new_xauusd_price?: number | null
          old_available_margin?: number | null
          old_gold_kg?: number | null
          old_margin_pct?: number | null
          old_required_margin?: number | null
          old_status?: string | null
          old_usd_balance?: number | null
          old_xauusd_price?: number | null
          user_id: string
          username: string
        }
        Update: {
          changed_field?: string
          client_id?: string
          created_at?: string
          id?: string
          new_available_margin?: number | null
          new_gold_kg?: number | null
          new_margin_pct?: number | null
          new_required_margin?: number | null
          new_status?: string | null
          new_usd_balance?: number | null
          new_xauusd_price?: number | null
          old_available_margin?: number | null
          old_gold_kg?: number | null
          old_margin_pct?: number | null
          old_required_margin?: number | null
          old_status?: string | null
          old_usd_balance?: number | null
          old_xauusd_price?: number | null
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      swap_premium_companies: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      swap_premium_transactions: {
        Row: {
          amount_usd: number | null
          company_id: string
          created_at: string
          created_by: string
          grams: number
          id: string
          kind: string
          notes: string | null
          per_oz: number | null
          username: string
        }
        Insert: {
          amount_usd?: number | null
          company_id: string
          created_at?: string
          created_by: string
          grams?: number
          id?: string
          kind: string
          notes?: string | null
          per_oz?: number | null
          username: string
        }
        Update: {
          amount_usd?: number | null
          company_id?: string
          created_at?: string
          created_by?: string
          grams?: number
          id?: string
          kind?: string
          notes?: string | null
          per_oz?: number | null
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "swap_premium_transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "swap_premium_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      swap_profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          is_admin: boolean
          is_manager: boolean
          phone: string | null
          username: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          is_admin?: boolean
          is_manager?: boolean
          phone?: string | null
          username: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          is_admin?: boolean
          is_manager?: boolean
          phone?: string | null
          username?: string
        }
        Relationships: []
      }
      swap_report_history: {
        Row: {
          channel: string
          client_code: string | null
          client_id: string | null
          created_at: string
          details: Json | null
          format: string
          generated_by: string
          generated_by_username: string
          id: string
          report_type: string
        }
        Insert: {
          channel: string
          client_code?: string | null
          client_id?: string | null
          created_at?: string
          details?: Json | null
          format: string
          generated_by: string
          generated_by_username: string
          id?: string
          report_type: string
        }
        Update: {
          channel?: string
          client_code?: string | null
          client_id?: string | null
          created_at?: string
          details?: Json | null
          format?: string
          generated_by?: string
          generated_by_username?: string
          id?: string
          report_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "swap_report_history_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "swap_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      swap_settings: {
        Row: {
          company_name: string
          confidentiality_text: string
          default_additional_exposure_pct: number
          default_long_annual_rate: number
          default_margin_requirement_pct: number
          default_report_format: string
          default_short_annual_rate: number
          id: string
          language: string
          report_footer_text: string | null
          safe_threshold_pct: number
          show_logo_on_reports: boolean
          skip_saturday: boolean
          skip_sunday: boolean
          updated_at: string
          updated_by: string | null
          warning_threshold_pct: number
          wednesday_multiplier: number
          xau_api_key: string | null
          xau_api_provider: string | null
          xau_auto_refresh_seconds: number
          xau_manual_fallback_price: number | null
        }
        Insert: {
          company_name?: string
          confidentiality_text?: string
          default_additional_exposure_pct?: number
          default_long_annual_rate?: number
          default_margin_requirement_pct?: number
          default_report_format?: string
          default_short_annual_rate?: number
          id?: string
          language?: string
          report_footer_text?: string | null
          safe_threshold_pct?: number
          show_logo_on_reports?: boolean
          skip_saturday?: boolean
          skip_sunday?: boolean
          updated_at?: string
          updated_by?: string | null
          warning_threshold_pct?: number
          wednesday_multiplier?: number
          xau_api_key?: string | null
          xau_api_provider?: string | null
          xau_auto_refresh_seconds?: number
          xau_manual_fallback_price?: number | null
        }
        Update: {
          company_name?: string
          confidentiality_text?: string
          default_additional_exposure_pct?: number
          default_long_annual_rate?: number
          default_margin_requirement_pct?: number
          default_report_format?: string
          default_short_annual_rate?: number
          id?: string
          language?: string
          report_footer_text?: string | null
          safe_threshold_pct?: number
          show_logo_on_reports?: boolean
          skip_saturday?: boolean
          skip_sunday?: boolean
          updated_at?: string
          updated_by?: string | null
          warning_threshold_pct?: number
          wednesday_multiplier?: number
          xau_api_key?: string | null
          xau_api_provider?: string | null
          xau_auto_refresh_seconds?: number
          xau_manual_fallback_price?: number | null
        }
        Relationships: []
      }
      swap_xau_snapshots: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          price: number
          source: string
          username: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          price: number
          source?: string
          username?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          price?: number
          source?: string
          username?: string | null
        }
        Relationships: []
      }
      user_module_permissions: {
        Row: {
          can_create: boolean
          can_delete: boolean
          can_edit: boolean
          can_export: boolean
          can_share: boolean
          can_view: boolean
          module: Database["public"]["Enums"]["app_module"]
          updated_at: string
          user_id: string
        }
        Insert: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_export?: boolean
          can_share?: boolean
          can_view?: boolean
          module: Database["public"]["Enums"]["app_module"]
          updated_at?: string
          user_id: string
        }
        Update: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_export?: boolean
          can_share?: boolean
          can_view?: boolean
          module?: Database["public"]["Enums"]["app_module"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_refinery: {
        Args: { _rid: string; _uid: string }
        Returns: boolean
      }
      has_module_permission: {
        Args: {
          _action: string
          _module: Database["public"]["Enums"]["app_module"]
          _uid: string
        }
        Returns: boolean
      }
      is_platform_admin: { Args: { _uid: string }; Returns: boolean }
      is_purity_user: { Args: { _uid: string }; Returns: boolean }
      is_refinery_admin: { Args: { _uid: string }; Returns: boolean }
      is_swap_user: { Args: { _uid: string }; Returns: boolean }
      refinery_reverse_transaction: {
        Args: { _tx_id: string }
        Returns: {
          average_purity: number
          client_id: string
          created_at: string
          created_by: string | null
          da_amount: number
          direction: Database["public"]["Enums"]["refinery_tx_direction"]
          fee_price: number
          id: string
          new_da_balance: number | null
          new_da_stock: number | null
          new_gold_stock: number | null
          new_purity_balance: number | null
          notes: string | null
          previous_da_balance: number | null
          previous_da_stock: number | null
          previous_gold_stock: number | null
          previous_purity_balance: number | null
          refinery_id: string
          settled_at: string | null
          status: Database["public"]["Enums"]["refinery_tx_status"]
          total_gross_weight: number
          total_pure_weight: number
          total_refining_fee: number
          transaction_date: string
          transaction_number: string
          transaction_type: Database["public"]["Enums"]["refinery_tx_type"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "refinery_transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      refinery_settle_transaction: {
        Args: { _tx_id: string }
        Returns: {
          average_purity: number
          client_id: string
          created_at: string
          created_by: string | null
          da_amount: number
          direction: Database["public"]["Enums"]["refinery_tx_direction"]
          fee_price: number
          id: string
          new_da_balance: number | null
          new_da_stock: number | null
          new_gold_stock: number | null
          new_purity_balance: number | null
          notes: string | null
          previous_da_balance: number | null
          previous_da_stock: number | null
          previous_gold_stock: number | null
          previous_purity_balance: number | null
          refinery_id: string
          settled_at: string | null
          status: Database["public"]["Enums"]["refinery_tx_status"]
          total_gross_weight: number
          total_pure_weight: number
          total_refining_fee: number
          transaction_date: string
          transaction_number: string
          transaction_type: Database["public"]["Enums"]["refinery_tx_type"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "refinery_transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      user_refinery_id: { Args: { _uid: string }; Returns: string }
    }
    Enums: {
      app_module:
        | "purity"
        | "margin"
        | "swap"
        | "premium"
        | "reports"
        | "audit"
        | "users"
        | "settings"
      refinery_bar_type: "bar" | "scrap"
      refinery_movement_type:
        | "receiving_da"
        | "delivery_da"
        | "receiving_gold"
        | "delivery_gold"
        | "adjustment"
        | "reversal"
      refinery_role: "manager" | "staff" | "viewer"
      refinery_tx_direction: "receiving" | "delivery"
      refinery_tx_status: "draft" | "pending" | "settled" | "cancelled"
      refinery_tx_type: "da" | "gold"
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
      app_module: [
        "purity",
        "margin",
        "swap",
        "premium",
        "reports",
        "audit",
        "users",
        "settings",
      ],
      refinery_bar_type: ["bar", "scrap"],
      refinery_movement_type: [
        "receiving_da",
        "delivery_da",
        "receiving_gold",
        "delivery_gold",
        "adjustment",
        "reversal",
      ],
      refinery_role: ["manager", "staff", "viewer"],
      refinery_tx_direction: ["receiving", "delivery"],
      refinery_tx_status: ["draft", "pending", "settled", "cancelled"],
      refinery_tx_type: ["da", "gold"],
    },
  },
} as const
