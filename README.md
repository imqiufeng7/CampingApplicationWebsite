# 客製化活動報名系統

Next.js (App Router) + Supabase（Postgres + Storage + Auth + RLS）打造的活動報名系統。完整需求見 [`報名系統開發規格書.md`](./報名系統開發規格書.md)；目前實作範圍為第一階段「核心流程 MVP」（見下方「已完成 / 尚未完成」）。

## 1. 建立 Supabase 專案

1. 到 [supabase.com](https://supabase.com) 建立一個新專案。
2. 到 **Project Settings → API**，複製 `Project URL`、`anon public` key、`service_role` key。
3. 複製 `.env.local.example` 為 `.env.local`，填入上述三個值，以及：
   - `NEXT_PUBLIC_SITE_URL`：本機開發填 `http://localhost:3000`，正式環境填實際網域。
   - `ECPAY_MERCHANT_ID` / `ECPAY_HASH_KEY` / `ECPAY_HASH_IV`：綠界商店資訊，`ECPAY_MODE` 測試環境填 `test`。
   - `EMAIL_PROVIDER` 先保留 `console`（信件會印在伺服器 log，不會真的寄出）；之後有 Resend API Key 時改成 `resend` 並填 `RESEND_API_KEY`、`EMAIL_FROM_ADDRESS` 即可切換，不需要改程式碼。

## 2. 套用資料庫 migration

需要 [Supabase CLI](https://supabase.com/docs/guides/cli)（已安裝於此環境，可用 `npx supabase`）。

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

`supabase db push` 會依序套用 `supabase/migrations/` 下的 5 個檔案：

1. `..._init_schema.sql`：建立所有資料表（含身分證字號加密欄位、日後階段要用的 QR/重複比對/退費欄位）
2. `..._rls_policies.sql`：角色權限的 row-level 規則
3. `..._column_permission_triggers.sql`：host_org / finance 各自能改哪些欄位的資料庫層強制規則
4. `..._storage_setup.sql`：建立私有的 `registration-files` Storage bucket
5. `..._registration_functions.sql`：`fn_submit_registration`（唯一的報名寫入入口）與 `fn_get_registration_member_id_number`（審核頁解密顯示身分證字號用）

> 若想先在本機用 Docker 跑 `npx supabase start` 做本機測試也可以，用法相同，只是連線對象換成本機 Postgres。

### 上線前務必更換身分證字號加密金鑰

`_init_schema.sql` 會自動產生一組隨機金鑰存在 `private.app_secrets`，方便本機測試，但正式上線前請到 Supabase SQL Editor 執行：

```sql
select private.set_id_number_key('換成一組夠長的隨機字串');
```

## 3. 建立第一個廠商（vendor）帳號

目前沒有自助註冊流程，第一個帳號需手動建立：

1. Supabase Dashboard → **Authentication → Users → Add user**，建立一個 email/password 帳號。
2. 到 **SQL Editor** 執行（`<uuid>` 換成剛剛建立的 user id）：

```sql
insert into public.admin_users (id, email, name, role, managed_session_ids)
values ('<uuid>', 'you@example.com', '你的名字', 'vendor', '{}');
```

之後就可以用這組帳密登入 `/admin/login`。vendor 角色可以在 `/admin/series` 建立系列/場次，並在 **SQL Editor** 用同樣方式建立 `host_org`／`finance` 角色帳號（`managed_session_ids` 填入他們負責的場次 id 陣列）。

## 4. 開發

```bash
npm run dev
```

- 後台：http://localhost:3000/admin
- 前台報名表單：`/s/[sessionId]`（場次狀態需為「開放中」才能報名，網址在後台場次設定頁會顯示）

`npm run build` / `npx tsc --noEmit` / `npm run lint` 皆已驗證可通過（使用假的環境變數跑 build，因為這個環境還沒連到真實 Supabase 專案）。

## 5. 已完成（第一階段 MVP）

1. 資料庫 schema + RLS + 欄位層級權限觸發器 + Storage bucket
2. 登入（Supabase Auth）+ 角色權限後台骨架（vendor / host_org / finance）
3. 場次建置 CRUD（系列、場次、身分別、免付費/減免類別）— vendor 專用
4. 前台動態報名表單（單頁展開、多成員、條件式欄位、檔案上傳）
5. 後台審核介面（逐人減免審核、錄取/分組/取消，角色權限 UI + DB 雙重把關）
6. Email 佇列骨架（console adapter，`EMAIL_PROVIDER=resend` 一鍵切換）+「寄出審核結果通知」批次流程
7. 綠界 ECPay 串接（自動產生付款連結、webhook 自動核銷）+ 人工轉帳路徑

## 6. 尚未實作（依規格書，刻意留到後續階段）

資料表欄位已預留、不需要日後破壞性遷移，但邏輯尚未實作：

- OCR 輔助審核
- QR code 報到（掃碼頁面 + 報到記錄）
- 同系列跨場次重複報名比對
- 退費金額自動試算（目前為手動填寫）
- 備取自動遞補
- 結果打碼公開頁面
- 活動前批次通知（依身分別）
- 「複製既有設定」快速建立新一屆活動

## 7. 尚未驗證

這個開發環境沒有 Docker，也還沒連到真實 Supabase 專案，因此以下事項需要你實際連上專案後驗證：

- migration 是否套用成功（型別/RLS/trigger 語法皆已仔細檢查，但未跑過真實 Postgres）
- 綠界 CheckMacValue 計算是否與正式環境行為一致（已依官方演算法實作，建議先用測試商店代號跑一次完整付款流程）
- Storage 簽名上傳/下載流程的實際行為
