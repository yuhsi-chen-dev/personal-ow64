import type { Metadata } from "next";
import { ContactEmail, LegalPage, Section } from "../legal.tsx";

export const metadata: Metadata = {
  title: "隱私權政策 — Open Window 64",
  description: "Open Window 64 蒐集什麼資料、存在哪裡、怎麼刪掉。",
};

export default function Privacy() {
  return (
    <LegalPage title="隱私權政策" updated="2026-08-25">
      <p>
        Open Window 64（以下稱「本服務」）是一個個人開發的曼陀羅計劃表工具。這份政策說明本服務會拿到你的哪些資料、拿來做什麼、存在哪裡，以及你要怎麼把它刪掉。
      </p>

      <Section title="會蒐集哪些資料">
        <ul>
          <li>
            <strong>Google 帳號的識別碼</strong>：你用 Google 登入時，本服務會取得 Google 給這個帳號的識別碼（sub）、email 與名稱。<strong>只有識別碼會寫進資料庫</strong>，用來標記哪些計劃表是你的；email 與名稱只存在你瀏覽器裡那顆經過簽章的登入 cookie，不會進資料庫。
          </li>
          <li>
            <strong>你自己輸入的內容</strong>：計劃表的核心目標、次目標、具體行為、追蹤方式，以及每一次打卡的時間紀錄。
          </li>
        </ul>
        <p>
          本服務不會讀取你 Google 帳號裡的其他東西——沒有信件、沒有雲端硬碟、沒有聯絡人、沒有行事曆。也沒有安裝任何分析或廣告追蹤工具。
        </p>
      </Section>

      <Section title="資料存在哪裡">
        <ul>
          <li>網站由 Vercel 代管，資料庫用 Neon 的 PostgreSQL，兩者的伺服器都在美國。</li>
          <li>登入狀態放在你瀏覽器的 cookie 裡，內容經過簽章，關掉瀏覽器或按登出就失效。</li>
        </ul>
      </Section>

      <Section title="AI 建議會把什麼送出去">
        <p>
          本服務有一個選用功能：請 AI 把你的核心目標拆成 8 個次目標，或把某個次目標拆成 8 項行為。<strong>只有在你主動按下那顆按鈕時</strong>，你輸入的那段目標文字才會送到 Google 的 Gemini API 產生建議。不按就完全不會送出。打卡紀錄、其他計劃表的內容，任何時候都不會送出去。
        </p>
      </Section>

      <Section title="會不會給別人">
        <p>
          不會。本服務不販售、不交換、不提供你的資料給第三方，除了上面列出的代管商（Vercel、Neon）與你主動觸發的 AI 服務（Google Gemini）——他們是本服務運作所必需的，各自受自己的隱私權政策約束。法律要求時例外。
        </p>
        <p>
          本服務<strong>不是</strong>協作工具：沒有分享、沒有指派、沒有留言。其他使用者看不到你的任何內容。
        </p>
      </Section>

      <Section title="你可以怎麼刪掉">
        <ul>
          <li>
            <strong>刪掉單一計劃表</strong>：在首頁的清單上按刪除。整份表連同底下的次目標、行為與打卡紀錄會從資料庫真的刪除，沒有復原。
          </li>
          <li>
            <strong>刪掉整個帳號與全部資料</strong>：目前沒有自助的按鈕，寄信到 <ContactEmail /> 說明你登入用的 email，會在 30 天內把資料庫裡屬於你的資料全部刪除並回覆確認。
          </li>
          <li>
            <strong>撤銷登入授權</strong>：到 Google 帳號的「第三方應用程式與服務」把 Open Window 64 移除。這會讓你登不進來，但不會刪掉資料庫裡既有的資料——要刪請照上一條。
          </li>
        </ul>
      </Section>

      <Section title="保留多久">
        <p>
          你的資料會一直留著，直到你刪掉它或本服務關閉為止。本服務是個人專案，沒有服務水準承諾；若決定關閉，會在關閉前以你登入用的 email 通知，並給一段時間讓你把內容抄走。
        </p>
      </Section>

      <Section title="兒童">
        <p>本服務不針對 13 歲以下的兒童，也不會刻意蒐集他們的資料。</p>
      </Section>

      <Section title="政策有變動時">
        <p>
          修改會直接更新這一頁並改掉上面的日期。若變動涉及會多蒐集哪些資料，會在你下次登入時另行說明。
        </p>
      </Section>

      <Section title="聯絡方式">
        <p>對這份政策或你的資料有任何問題，寄信到 <ContactEmail />。</p>
      </Section>
    </LegalPage>
  );
}
