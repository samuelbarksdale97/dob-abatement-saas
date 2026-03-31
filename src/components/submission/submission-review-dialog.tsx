'use client';

import { useState, useEffect } from 'react';
import { Loader2, FileText, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import type { SubmissionPdfData, SubmissionPdfItem } from '@/lib/pdf/generate-submission';

interface SubmissionReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: SubmissionPdfData;
  onConfirm: (editedData: SubmissionPdfData) => void;
  generating: boolean;
}

export function SubmissionReviewDialog({
  open,
  onOpenChange,
  data,
  onConfirm,
  generating,
}: SubmissionReviewDialogProps) {
  const [editedData, setEditedData] = useState<SubmissionPdfData>(data);

  // Sync when data prop changes (dialog re-opens with new data)
  useEffect(() => {
    setEditedData(data);
  }, [data]);

  const updateField = (field: keyof SubmissionPdfData, value: string) => {
    setEditedData((prev) => ({ ...prev, [field]: value }));
  };

  const updateItem = (index: number, field: keyof SubmissionPdfItem, value: string | number | null) => {
    setEditedData((prev) => {
      const items = [...prev.items];
      items[index] = { ...items[index], [field]: value };
      return { ...prev, items };
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-black tracking-tight">
            Review Submission Report
          </DialogTitle>
          <DialogDescription>
            Review and edit the information below before generating the PDF. All fields are editable.
          </DialogDescription>
        </DialogHeader>

        {/* Cover Letter Fields */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">
            Cover Letter
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="contactName">Contact Name</Label>
              <Input
                id="contactName"
                value={editedData.contactName}
                onChange={(e) => updateField('contactName', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contactCompany">Company</Label>
              <Input
                id="contactCompany"
                value={editedData.contactCompany}
                onChange={(e) => updateField('contactCompany', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contactEmail">Email</Label>
              <Input
                id="contactEmail"
                type="email"
                value={editedData.contactEmail}
                onChange={(e) => updateField('contactEmail', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contactPhone">Phone</Label>
              <Input
                id="contactPhone"
                value={editedData.contactPhone || ''}
                onChange={(e) => updateField('contactPhone', e.target.value || '')}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="address">Property Address</Label>
              <Input
                id="address"
                value={editedData.address}
                onChange={(e) => updateField('address', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="respondent">Respondent</Label>
              <Input
                id="respondent"
                value={editedData.respondent}
                onChange={(e) => updateField('respondent', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="noiNumber">NOI Number</Label>
              <Input
                id="noiNumber"
                value={editedData.noiNumber}
                onChange={(e) => updateField('noiNumber', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="noiDate">NOI Date</Label>
              <Input
                id="noiDate"
                value={editedData.noiDate}
                onChange={(e) => updateField('noiDate', e.target.value)}
              />
            </div>
          </div>
        </div>

        <Separator />

        {/* Items */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">
            Violation Items ({editedData.items.length})
          </h3>

          {editedData.items.map((item, index) => (
            <div
              key={index}
              className="rounded-xl border border-slate-200 p-4 space-y-4"
            >
              {/* Item header */}
              <div className="flex items-center gap-2">
                <span className="text-base font-black tracking-tight text-slate-800">
                  Item {item.item_number}
                </span>
                <span className="text-sm text-slate-500">{item.violation_code}</span>
              </div>

              {/* Editable item fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Violation Code</Label>
                  <Input
                    value={item.violation_code}
                    onChange={(e) => updateItem(index, 'violation_code', e.target.value)}
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Location</Label>
                  <Input
                    value={item.specific_location || ''}
                    onChange={(e) => updateItem(index, 'specific_location', e.target.value)}
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Priority</Label>
                  <Input
                    type="number"
                    value={item.priority}
                    onChange={(e) => updateItem(index, 'priority', parseInt(e.target.value) || 0)}
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Abatement Deadline</Label>
                  <Input
                    value={item.abatement_deadline || ''}
                    onChange={(e) => updateItem(index, 'abatement_deadline', e.target.value)}
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Fine ($)</Label>
                  <Input
                    type="number"
                    value={item.fine ?? ''}
                    onChange={(e) => updateItem(index, 'fine', e.target.value ? parseFloat(e.target.value) : null)}
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Date of Infraction</Label>
                  <Input
                    value={item.date_of_infraction || ''}
                    onChange={(e) => updateItem(index, 'date_of_infraction', e.target.value)}
                    className="text-sm"
                  />
                </div>
              </div>

              {/* Violation description */}
              <div className="space-y-1.5">
                <Label className="text-xs">Violation Description</Label>
                <Textarea
                  value={item.violation_description || ''}
                  onChange={(e) => updateItem(index, 'violation_description', e.target.value)}
                  rows={2}
                  className="text-sm"
                />
              </div>

              {/* Task description / Explanation */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Explanation (appears in PDF)</Label>
                <Textarea
                  value={item.task_description || ''}
                  onChange={(e) => updateItem(index, 'task_description', e.target.value)}
                  rows={2}
                  className="text-sm"
                />
              </div>

              {/* Photo previews */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-400">Violation Photo</Label>
                  {item.inspectorPhotoDataUrl ? (
                    <img
                      src={item.inspectorPhotoDataUrl}
                      alt="Inspector photo"
                      className="h-32 w-full rounded-lg border border-slate-200 object-cover bg-slate-50"
                    />
                  ) : (
                    <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50">
                      <div className="flex flex-col items-center gap-1 text-slate-400">
                        <ImageIcon className="h-5 w-5" />
                        <span className="text-[10px] font-semibold uppercase tracking-wider">No photo</span>
                      </div>
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-400">Remediation Photo</Label>
                  {item.remediationPhotoDataUrl ? (
                    <img
                      src={item.remediationPhotoDataUrl}
                      alt="Remediation photo"
                      className="h-32 w-full rounded-lg border border-slate-200 object-cover bg-slate-50"
                    />
                  ) : (
                    <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50">
                      <div className="flex flex-col items-center gap-1 text-slate-400">
                        <ImageIcon className="h-5 w-5" />
                        <span className="text-[10px] font-semibold uppercase tracking-wider">No photo</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={generating}
          >
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm(editedData)}
            disabled={generating}
          >
            {generating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating PDF...
              </>
            ) : (
              <>
                <FileText className="mr-2 h-4 w-4" />
                Confirm & Generate PDF
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
