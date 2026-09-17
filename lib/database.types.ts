/**
 * Types de la base, écrits à la main d'après supabase/migrations/0001_init.sql.
 *
 * Pour les régénérer depuis le vrai schéma (recommandé après chaque migration) :
 *   pnpm dlx supabase gen types typescript --project-id <ref> > lib/database.types.ts
 */

export type ServerRole = 'owner' | 'admin' | 'member'
export type FriendshipStatus = 'pending' | 'accepted' | 'blocked'
export type GameStatus = 'waiting' | 'playing' | 'finished'
export type GameOutcome = 'win' | 'draw' | 'forfeit'

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          username: string
          display_name: string
          avatar_url: string | null
          bio: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          username: string
          display_name: string
          avatar_url?: string | null
          bio?: string | null
        }
        Update: {
          username?: string
          display_name?: string
          avatar_url?: string | null
          bio?: string | null
        }
        Relationships: []
      }
      servers: {
        Row: {
          id: string
          name: string
          description: string | null
          icon_url: string | null
          owner_id: string
          is_public: boolean
          invite_code: string
          created_at: string
          updated_at: string
        }
        Insert: {
          name: string
          owner_id: string
          description?: string | null
          icon_url?: string | null
          is_public?: boolean
        }
        Update: {
          name?: string
          description?: string | null
          icon_url?: string | null
          is_public?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "servers_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      server_members: {
        Row: {
          server_id: string
          profile_id: string
          role: ServerRole
          nickname: string | null
          joined_at: string
        }
        Insert: {
          server_id: string
          profile_id: string
          role?: ServerRole
          nickname?: string | null
        }
        Update: {
          role?: ServerRole
          nickname?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "server_members_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "server_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          id: string
          server_id: string
          name: string
          topic: string | null
          position: number
          created_at: string
        }
        Insert: {
          server_id: string
          name: string
          topic?: string | null
          position?: number
        }
        Update: {
          name?: string
          topic?: string | null
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "channels_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          id: string
          channel_id: string
          author_id: string
          content: string
          created_at: string
          edited_at: string | null
        }
        Insert: {
          channel_id: string
          author_id: string
          content: string
        }
        Update: {
          content?: string
          edited_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_reads: {
        Row: {
          channel_id: string
          profile_id: string
          last_read_message_id: string | null
          last_read_at: string
        }
        Insert: {
          channel_id: string
          profile_id: string
          last_read_message_id?: string | null
          last_read_at?: string
        }
        Update: {
          last_read_message_id?: string | null
          last_read_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_reads_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_reads_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_reads_last_read_message_id_fkey"
            columns: ["last_read_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      friendships: {
        Row: {
          id: string
          requester_id: string
          addressee_id: string
          status: FriendshipStatus
          created_at: string
          responded_at: string | null
          user_low: string
          user_high: string
        }
        Insert: {
          requester_id: string
          addressee_id: string
          status?: FriendshipStatus
        }
        Update: {
          status?: FriendshipStatus
          responded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "friendships_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_addressee_id_fkey"
            columns: ["addressee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dm_conversations: {
        Row: {
          id: string
          user_low: string
          user_high: string
          created_at: string
        }
        Insert: {
          user_low: string
          user_high: string
        }
        Update: Record<string, never>
        Relationships: [
          {
            foreignKeyName: "dm_conversations_user_low_fkey"
            columns: ["user_low"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dm_conversations_user_high_fkey"
            columns: ["user_high"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      direct_messages: {
        Row: {
          id: string
          conversation_id: string
          author_id: string
          content: string
          created_at: string
          edited_at: string | null
        }
        Insert: {
          conversation_id: string
          author_id: string
          content: string
        }
        Update: {
          content?: string
          edited_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "direct_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "dm_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dm_reads: {
        Row: {
          conversation_id: string
          profile_id: string
          last_read_at: string
        }
        Insert: {
          conversation_id: string
          profile_id: string
          last_read_at?: string
        }
        Update: {
          last_read_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dm_reads_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "dm_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dm_reads_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_presence: {
        Row: {
          profile_id: string
          last_seen_at: string
        }
        Insert: {
          profile_id: string
          last_seen_at?: string
        }
        Update: {
          last_seen_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_presence_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          id: string
          conversation_id: string | null
          channel_id: string | null
          player1_id: string
          player2_id: string | null
          board: string
          turn: number
          status: GameStatus
          winner_id: string | null
          outcome: GameOutcome | null
          created_at: string
          updated_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      sports: {
        Row: {
          id: string
          name: string
          emoji: string
          position: number
        }
        Insert: never
        Update: never
        Relationships: []
      }
      teams: {
        Row: {
          id: string
          sport_id: string
          name: string
          short_name: string
          league: string
          country: string
          /** Identifiant chez TheSportsDB ; nul tant que l'équipe n'est pas raccordée. */
          provider_team_id: string | null
          /** Libellé du championnat chez le fournisseur ('French Ligue 1'). */
          provider_league: string | null
          badge_url: string | null
          discovered_by: string | null
          /** Vrai pour les équipes proposées à l'ouverture, fausses pour celles trouvées par recherche. */
          is_catalogue: boolean
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: "teams_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
        ]
      }
      team_follows: {
        Row: {
          profile_id: string
          team_id: string
          created_at: string
        }
        Insert: {
          profile_id: string
          team_id: string
          created_at?: string
        }
        /** Suivre ou ne plus suivre : on ajoute ou on retire, jamais on ne modifie. */
        Update: never
        Relationships: [
          {
            foreignKeyName: "team_follows_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_follows_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      is_server_member: { Args: { p_server_id: string }; Returns: boolean }
      has_server_role: { Args: { p_server_id: string; p_roles: ServerRole[] }; Returns: boolean }
      channel_server_id: { Args: { p_channel_id: string }; Returns: string }
      shares_server_with: { Args: { p_profile_id: string }; Returns: boolean }
      is_linked_to: { Args: { p_profile_id: string }; Returns: boolean }
      is_dm_participant: { Args: { p_conversation_id: string }; Returns: boolean }
      find_profile_by_username: {
        Args: { p_username: string }
        Returns: { id: string; username: string; display_name: string; avatar_url: string | null }[]
      }
      send_friend_request: { Args: { p_username: string }; Returns: string }
      get_or_create_dm: { Args: { p_other: string }; Returns: string }
      join_server_by_invite: { Args: { p_code: string }; Returns: string }
      regenerate_invite_code: { Args: { p_server_id: string }; Returns: string }
      p4_gagnant: { Args: { p_board: string }; Returns: string | null }
      peut_acceder_au_fil: {
        Args: { p_conversation_id: string | null; p_channel_id: string | null }
        Returns: boolean
      }
      create_game: {
        Args: { p_conversation_id: string | null; p_channel_id: string | null }
        Returns: string
      }
      join_game: { Args: { p_game_id: string }; Returns: undefined }
      play_move: { Args: { p_game_id: string; p_column: number }; Returns: undefined }
      forfeit_game: { Args: { p_game_id: string }; Returns: undefined }
      set_member_role: {
        Args: { p_server_id: string; p_profile_id: string; p_role: ServerRole }
        Returns: undefined
      }
      ensure_team: {
        Args: {
          p_provider_id: string
          p_sport_id: string
          p_name: string
          p_league: string
          p_badge_url: string | null
        }
        Returns: string
      }
    }
    Enums: {
      server_role: ServerRole
      friendship_status: FriendshipStatus
    }
    CompositeTypes: { [_ in never]: never }
  }
}

// Raccourcis pratiques
export type Profile = Database['public']['Tables']['profiles']['Row']
export type Server = Database['public']['Tables']['servers']['Row']
export type Channel = Database['public']['Tables']['channels']['Row']
export type Message = Database['public']['Tables']['messages']['Row']
export type ServerMember = Database['public']['Tables']['server_members']['Row']
export type Friendship = Database['public']['Tables']['friendships']['Row']
export type DmConversation = Database['public']['Tables']['dm_conversations']['Row']
export type DirectMessage = Database['public']['Tables']['direct_messages']['Row']
export type DmRead = Database['public']['Tables']['dm_reads']['Row']
export type Game = Database['public']['Tables']['games']['Row']
export type Sport = Database['public']['Tables']['sports']['Row']
export type Team = Database['public']['Tables']['teams']['Row']

/** Un message accompagné de l'auteur, tel que renvoyé par la jointure. */
export type MessageWithAuthor = Message & {
  author: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'> | null
}
