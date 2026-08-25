import type { Metadata } from "next";
import { ContactEmail, LegalPage, Section } from "../legal.tsx";

export const metadata: Metadata = {
  title: "服務條款 — Open Window 64",
  description: "使用 Open Window 64 的條件：免費、個人專案、沒有服務水準承諾。",
};

export default function Terms() {
  return (
    <LegalPage title="服務條款" updated="2026-08-25">
      <p>
        使用 Open Window 64（以下稱「本服務」）就表示你同意以下這些條件。看不順眼就別用，這是最乾脆的辦法。
      </p>

      <Section title="這是什麼">
        <p>
          本服務是一個個人開發、免費提供的曼陀羅計劃表工具：把一個核心目標拆成 8 個次目標、64 項具體行為，然後追蹤執行狀況。它是給個人做長期目標管理用的，不是協作工具。
        </p>
      </Section>

      <Section title="帳號">
        <p>
          登入走 Google 帳號，本服務沒有自己的密碼。你要為你帳號底下發生的事負責；帳號被盜或懷疑被盜，請先到 Google 處理，再通知我。
        </p>
      </Section>

      <Section title="你放進來的內容">
        <p>
          你輸入的目標、行為與紀錄都是你的，本服務不會拿去做別的用途。相對地，請不要放進違法的內容，也不要用本服務做違法的事。
        </p>
        <p>
          請不要把身分證號、金融帳號、病歷這類高度敏感的資料寫進格子裡——本服務沒有為那種等級的資料做設計。
        </p>
      </Section>

      <Section title="沒有保證">
        <p>
          本服務以「現況」提供，<strong>沒有任何明示或默示的保證</strong>：不保證不中斷、不保證沒有錯誤、不保證資料不會遺失。這是個人專案，不是有維運團隊的商業產品，沒有服務水準承諾。重要的東西請自己另外留一份。
        </p>
        <p>
          在法律允許的範圍內，因使用或無法使用本服務而造成的任何損失，本服務的開發者不負賠償責任。
        </p>
      </Section>

      <Section title="AI 建議只是建議">
        <p>
          AI 產生的次目標與行為只是給你當起點的草稿，可能不準、不合適，也可能講錯。採用之前請自己判斷。任何涉及健康、財務或法律的決定，不要只靠它。
        </p>
      </Section>

      <Section title="停用與終止">
        <p>
          你隨時可以停止使用並要求刪除資料，做法見<a href="/privacy" target="_blank" className="text-accent-text hover:underline hover:underline-offset-4">隱私權政策</a>。若有濫用行為（例如試圖存取別人的資料、或耗用資源到影響其他人），本服務保留停用該帳號的權利。本服務也可能因為個人因素關閉，關閉前會事先通知。
        </p>
      </Section>

      <Section title="條款有變動時">
        <p>修改會直接更新這一頁並改掉上面的日期。改完之後繼續使用，就視為你接受新的條款。</p>
      </Section>

      <Section title="聯絡方式">
        <p>有問題寄信到 <ContactEmail />。</p>
      </Section>
    </LegalPage>
  );
}
