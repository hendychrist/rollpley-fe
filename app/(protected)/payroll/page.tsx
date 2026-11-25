import { Panel, PageHeader } from "@/components/base/panel";
import { BatchList } from "@/components/payroll/batch-list";
import { PayrollUploader } from "@/components/payroll/payroll-uploader";
export default function PayrollPage() { return <div className="content-wrap"><PageHeader title="Payroll" description="Unggah satu PDF payroll, periksa hasil pencocokan, lalu finalkan dan unduh file bank." /><Panel className="upload-panel"><PayrollUploader /></Panel><section className="history-section"><BatchList /></section></div>; }
