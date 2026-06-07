DO $migration$
DECLARE
  v_admin_id uuid := '2b520781-66ca-4e4e-b762-8ae6e0c3ef8c';
  v_refinery_3601 uuid := 'c8145e9f-26a8-45da-9556-a2d611252d45';
  v_ath_id uuid := 'ea131904-4786-4377-bc9b-090bf7332798';
  v_brh_id uuid := gen_random_uuid();
  v_brh_email text := 'brh-3601@ather.group';
  v_brh_temp_password text := 'Brh3601!T8m2qZxR';
  v_existing uuid;
BEGIN
  -- ============================================================
  -- 1) Rename ATH -> ATH-3601 (preserve everything else)
  -- ============================================================
  UPDATE public.swap_profiles
     SET username = 'ATH-3601'
   WHERE id = v_ath_id;

  UPDATE public.refinery_users
     SET display_name = 'ATH-3601', role = 'manager', status = 'active', updated_at = now()
   WHERE user_id = v_ath_id;

  INSERT INTO public.swap_activity_log(user_id, username, action, module, entity_type, entity_id, old_values, new_values)
  VALUES (v_admin_id, 'admin', 'rename_user', 'users', 'user', v_ath_id,
          jsonb_build_object('username','ATH'),
          jsonb_build_object('username','ATH-3601','refinery_id', v_refinery_3601));

  -- ============================================================
  -- 2) Create BRH-3601 (auth.users + identity + swap_profile + refinery_users)
  -- ============================================================
  SELECT id INTO v_existing FROM auth.users WHERE email = v_brh_email;
  IF v_existing IS NULL THEN
    INSERT INTO auth.users(
      id, instance_id, aud, role, email,
      encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      v_brh_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', v_brh_email,
      crypt(v_brh_temp_password, gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('username','BRH-3601','must_change_password',true),
      now(), now(),
      '', '', '', ''
    );

    INSERT INTO auth.identities(
      id, user_id, provider, provider_id, identity_data,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_brh_id, 'email', v_brh_id::text,
      jsonb_build_object('sub', v_brh_id::text, 'email', v_brh_email, 'email_verified', true, 'provider', 'email'),
      now(), now(), now()
    );
  ELSE
    v_brh_id := v_existing;
    -- Reset password + metadata
    UPDATE auth.users
       SET encrypted_password = crypt(v_brh_temp_password, gen_salt('bf')),
           email_confirmed_at = COALESCE(email_confirmed_at, now()),
           raw_user_meta_data = COALESCE(raw_user_meta_data,'{}'::jsonb) ||
                                jsonb_build_object('username','BRH-3601','must_change_password',true),
           updated_at = now()
     WHERE id = v_brh_id;
  END IF;

  INSERT INTO public.swap_profiles(id, username, email, is_admin)
  VALUES (v_brh_id, 'BRH-3601', v_brh_email, false)
  ON CONFLICT (id) DO UPDATE SET username = EXCLUDED.username, email = EXCLUDED.email;

  INSERT INTO public.refinery_users(user_id, refinery_id, role, display_name, status)
  VALUES (v_brh_id, v_refinery_3601, 'manager', 'BRH-3601', 'active')
  ON CONFLICT (user_id) DO UPDATE
    SET refinery_id = EXCLUDED.refinery_id,
        role = EXCLUDED.role,
        display_name = EXCLUDED.display_name,
        status = EXCLUDED.status,
        updated_at = now();

  INSERT INTO public.swap_activity_log(user_id, username, action, module, entity_type, entity_id, new_values)
  VALUES (v_admin_id, 'admin', 'create_user', 'users', 'user', v_brh_id,
          jsonb_build_object('username','BRH-3601','refinery_id', v_refinery_3601,'role','manager','must_change_password', true));

  INSERT INTO public.swap_activity_log(user_id, username, action, module, entity_type, entity_id, new_values)
  VALUES (v_admin_id, 'admin', 'assign_refinery', 'users', 'refinery_user', v_brh_id,
          jsonb_build_object('refinery_id', v_refinery_3601, 'role','manager'));

END $migration$;