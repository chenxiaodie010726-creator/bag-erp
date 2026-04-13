import { redirect } from 'next/navigation';

/** 旧路径 /cost-sheets 重定向至 /cost-sheet */
export default function CostSheetsRedirectPage() {
  redirect('/cost-sheet');
}
