'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  CheckCircle,
  Circle,
  Loader2,
  XCircle,
  Clock,
  FileText,
  Database,
  ScanSearch,
  ImageIcon,
  PartyPopper,
  AlertTriangle,
  DollarSign,
  Copy,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { ParseMetadata, ParseStepStatus, ParseStepName } from '@/lib/ai/schemas';

interface ParseProgressProps {
  violationId: string;
  onComplete: () => void;
}

const VISIBLE_STEPS: ParseStepName[] = [
  'ai_parse',
  'insert_records',
  'analyze_pages',
  'match_photos',
  'complete',
];

const STEP_WEIGHT = 100 / VISIBLE_STEPS.length;

const STEP_CONFIG: Record<string, { label: string; icon: React.ElementType; description: string }> = {
  ai_parse:       { label: 'AI Analysis',    icon: FileText,    description: 'Reading and extracting violation data from your PDF' },
  insert_records: { label: 'Saving Data',     icon: Database,    description: 'Writing parsed violations to the database' },
  analyze_pages:  { label: 'Page Analysis',   icon: ScanSearch,  description: 'Identifying evidence photos on each page' },
  match_photos:   { label: 'Photo Matching',  icon: ImageIcon,   description: 'Linking evidence photos to violation items' },
  complete:       { label: 'Complete',         icon: PartyPopper, description: 'Finalizing and verifying all data' },
};

function formatSeconds(totalSecs: number): string {
  const m = Math.floor(totalSecs / 60);
  const s = totalSecs % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
}

export function ParseProgress({ violationId, onComplete }: ParseProgressProps) {
  const [metadata, setMetadata] = useState<ParseMetadata | null>(null);
  const [parseStatus, setParseStatus] = useState<string>('processing');
  const [startTime] = useState<number>(Date.now());
  const [elapsed, setElapsed] = useState<number>(0);
  const completionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [duplicateResolving, setDuplicateResolving] = useState(false);

  // Stable completion handler with delay so user sees the final state
  const handleComplete = useCallback(() => {
    if (completionTimer.current) return; // already scheduled
    completionTimer.current = setTimeout(onComplete, 1500);
  }, [onComplete]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (completionTimer.current) clearTimeout(completionTimer.current);
    };
  }, []);

  // Elapsed time ticker — runs while pending or processing
  useEffect(() => {
    if (parseStatus === 'completed' || parseStatus === 'failed' || parseStatus === 'duplicate') return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [parseStatus, startTime]);

  // Fetch initial state + realtime subscription
  useEffect(() => {
    const supabase = createClient();

    const fetchInitial = async () => {
      const { data } = await supabase
        .from('violations')
        .select('parse_metadata, parse_status')
        .eq('id', violationId)
        .single();

      if (data) {
        setMetadata(data.parse_metadata as ParseMetadata);
        setParseStatus(data.parse_status);
        if (data.parse_status === 'completed') {
          handleComplete();
        }
      }
    };
    fetchInitial();

    const channel = supabase
      .channel(`parse-${violationId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'violations',
          filter: `id=eq.${violationId}`,
        },
        (payload) => {
          const newData = payload.new as Record<string, unknown>;
          setMetadata(newData.parse_metadata as ParseMetadata);
          setParseStatus(newData.parse_status as string);
          if (newData.parse_status === 'completed') {
            handleComplete();
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [violationId, handleComplete]);

  // Polling fallback — ensures progress updates even if Realtime isn't enabled
  useEffect(() => {
    if (parseStatus === 'completed' || parseStatus === 'failed' || parseStatus === 'duplicate') return;

    const supabase = createClient();
    const poll = async () => {
      const { data } = await supabase
        .from('violations')
        .select('parse_metadata, parse_status')
        .eq('id', violationId)
        .single();

      if (data) {
        setMetadata(data.parse_metadata as ParseMetadata);
        setParseStatus(data.parse_status);
        if (data.parse_status === 'completed') {
          handleComplete();
        }
      }
    };

    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [violationId, parseStatus, handleComplete]);

  const isDuplicatePending = parseStatus === 'duplicate_pending';
  const duplicateViolationId = metadata?.duplicate_violation_id as string | undefined;
  const existingNoticeId = metadata?.existing_notice_id as string | undefined;

  const handleDuplicateDecision = async (action: 'overwrite' | 'cancel') => {
    setDuplicateResolving(true);
    try {
      const res = await fetch('/api/parse/duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ violationId, action }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || 'Failed to resolve duplicate');
      } else if (action === 'cancel') {
        toast.info('Upload cancelled');
        onComplete();
      }
      // If overwrite, the pipeline will resume and the polling will pick up the status change
    } catch {
      toast.error('Failed to resolve duplicate');
    } finally {
      setDuplicateResolving(false);
    }
  };

  const steps = metadata?.steps || [];

  // Compute overall progress
  const progress = steps.reduce((acc, step) => {
    if (!VISIBLE_STEPS.includes(step.step)) return acc;
    if (step.status === 'completed') return acc + STEP_WEIGHT;
    if (step.status === 'running') return acc + STEP_WEIGHT * 0.5;
    return acc;
  }, 0);

  // Filter to only visible steps, keeping order
  const visibleSteps = VISIBLE_STEPS.map(name =>
    steps.find(s => s.step === name) || { step: name, status: 'pending' as const },
  );

  const isFailed = parseStatus === 'failed';
  const isComplete = parseStatus === 'completed';

  // Duplicate pending — show prompt instead of normal progress
  if (isDuplicatePending) {
    return (
      <div className="rounded-2xl border-2 border-amber-300 bg-amber-50/50 p-6 sm:p-10 shadow-sm">
        <div className="flex flex-col items-center text-center gap-6">
          <div className="bg-amber-100 p-4 rounded-full">
            <Copy className="h-10 w-10 text-amber-600" />
          </div>
          <div>
            <h3 className="text-2xl font-black tracking-tight text-slate-900 mb-2">
              Duplicate NOI Detected
            </h3>
            <p className="text-sm font-medium text-slate-600 max-w-md mx-auto">
              This Notice of Infraction{existingNoticeId ? ` (${existingNoticeId})` : ''} has already been uploaded and processed.
              Would you like to overwrite the existing data with this new upload?
            </p>
          </div>
          <div className="flex gap-3 w-full max-w-sm">
            <Button
              variant="outline"
              className="flex-1 h-12 font-bold"
              onClick={() => handleDuplicateDecision('cancel')}
              disabled={duplicateResolving}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 h-12 font-bold bg-amber-600 hover:bg-amber-700"
              onClick={() => handleDuplicateDecision('overwrite')}
              disabled={duplicateResolving}
            >
              {duplicateResolving ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Overwrite
            </Button>
          </div>
          <p className="text-xs text-slate-400 max-w-sm">
            Overwriting will permanently delete the existing violation data and replace it with this upload.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border border-slate-200/80 bg-white p-6 sm:p-10 shadow-sm transition-colors ${
      isFailed ? 'border-red-300 bg-red-50/50' : ''
    }`}>
      {/* Header */}
      <div className="mb-8 flex items-center justify-between border-b border-slate-100 pb-5">
        <div>
          <h3 className="text-2xl font-black tracking-tight text-slate-900">
            {isFailed ? 'Parse Failed' :
             isComplete ? 'Parse Complete!' :
             'AI Processing Your NOI...'}
          </h3>
          {!isFailed && !isComplete && (
            <p className="mt-1 text-sm font-medium text-slate-500">This typically takes 30-60 seconds</p>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm font-bold text-slate-400 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200/60 shadow-inner">
          <Clock className="h-4 w-4" />
          <span className="tabular-nums tracking-wider">{formatSeconds(elapsed)}</span>
        </div>
      </div>

      {/* Overall Progress Bar */}
      <div className="mb-10">
        <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-wider">
          <span className="text-slate-500">Overall Progress</span>
          <span className="tabular-nums text-slate-400">{Math.round(progress)}%</span>
        </div>
        <Progress value={progress} className="h-3 rounded-full bg-slate-100 border border-slate-200/60 shadow-inner" />
      </div>

      {/* Step Timeline */}
      <div className="relative">
        {/* Synthetic "Preparing to process..." step */}
        {(() => {
          const aiParseStep = visibleSteps.find(s => s.step === 'ai_parse');
          const allPending = visibleSteps.every(s => s.status === 'pending');
          const preparingStatus =
            isFailed || isComplete ? null :
            allPending ? 'running' :
            (aiParseStep?.status === 'pending') ? 'running' :
            'completed';

          if (!preparingStatus) return null;

          return (
            <div className="relative flex gap-5 pb-8">
              {/* Vertical connecting line to first real step */}
              <div className={`absolute left-[19px] top-[38px] h-[calc(100%-24px)] w-[3px] rounded-full transition-colors duration-500 ${
                preparingStatus === 'completed' ? 'bg-emerald-300' : 'bg-slate-200'
              }`} />
              <div className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-500 shadow-sm ${
                preparingStatus === 'completed' ? 'border-emerald-500 bg-emerald-50' :
                'animate-breathe border-blue-500 bg-blue-50/80 shadow-blue-100'
              }`}>
                {preparingStatus === 'completed'
                  ? <CheckCircle className="h-5 w-5 text-emerald-600" />
                  : <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                }
              </div>
              <div className="flex-1 pt-1">
                <p className={`text-base font-bold tracking-tight ${
                  preparingStatus === 'completed' ? 'text-emerald-700' : 'text-blue-700'
                }`}>
                  Preparing to process...
                </p>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  Queuing your PDF for AI analysis
                </p>
              </div>
            </div>
          );
        })()}
        {visibleSteps.map((step, index) => {
          const config = STEP_CONFIG[step.step];
          const isLast = index === visibleSteps.length - 1;
          const isActive = step.status === 'running';
          const isDone = step.status === 'completed';
          const isStepFailed = step.status === 'failed';
          const isPending = step.status === 'pending';
          const StepIcon = config?.icon || Circle;

          return (
            <div key={step.step} className="relative flex gap-5 pb-8 last:pb-0">
              {/* Vertical connecting line */}
              {!isLast && (
                <div className={`absolute left-[19px] top-[38px] h-[calc(100%-24px)] w-[3px] rounded-full transition-colors duration-500 ${
                  isDone ? 'bg-emerald-300' : 'bg-slate-200'
                }`} />
              )}

              {/* Step icon circle */}
              <div className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-500 shadow-sm ${
                isDone ? 'border-emerald-500 bg-emerald-50' :
                isActive ? 'animate-breathe border-blue-500 bg-blue-50/80 shadow-blue-100' :
                isStepFailed ? 'border-red-500 bg-red-50' :
                'border-slate-200 bg-slate-50'
              }`}>
                {isDone && <CheckCircle className="h-5 w-5 text-emerald-600" />}
                {isActive && <Loader2 className="h-5 w-5 animate-spin text-blue-600" />}
                {isStepFailed && <XCircle className="h-5 w-5 text-red-600" />}
                {isPending && <StepIcon className="h-4 w-4 text-slate-300" />}
              </div>

              {/* Step content */}
              <div className={`flex-1 transition-opacity duration-500 pt-1 ${
                isPending ? 'opacity-40' : 'opacity-100'
              }`}>
                <div className="flex items-center gap-3">
                  <p className={`text-base font-bold tracking-tight ${
                    isActive ? 'text-blue-700' :
                    isDone ? 'text-emerald-700' :
                    isStepFailed ? 'text-red-700' :
                    'text-slate-400'
                  }`}>
                    {config?.label || step.step}
                  </p>
                </div>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  {step.message || config?.description}
                </p>
                {/* Error display */}
                {isStepFailed && (step.error || step.message) && (
                  <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-50/80 border border-red-100 p-3 shadow-sm">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                    <p className="text-sm font-medium text-red-700 leading-snug">{step.error || step.message}</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Live Data Preview Cards */}
      {metadata && (metadata.items_found != null || metadata.total_pages != null || metadata.photos_matched != null || metadata.costs) && (
        <>
          <Separator className="my-8 border-slate-100" />
          <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-4">
            {metadata.items_found != null && (
              <Card className="animate-in fade-in slide-in-from-bottom-4 duration-500 border-slate-200/60 shadow-sm rounded-xl overflow-hidden">
                <CardContent className="flex flex-col items-center justify-center p-5 sm:p-6 bg-blue-50/30">
                  <span className="text-3xl font-black tracking-tight text-blue-600 mb-1">{metadata.items_found}</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 text-center">Violations Found</span>
                </CardContent>
              </Card>
            )}
            {metadata.total_pages != null && (
              <Card className="animate-in fade-in slide-in-from-bottom-4 duration-500 border-slate-200/60 shadow-sm rounded-xl overflow-hidden">
                <CardContent className="flex flex-col items-center justify-center p-5 sm:p-6 bg-indigo-50/30">
                  <span className="text-3xl font-black tracking-tight text-indigo-600 mb-1">{metadata.total_pages}</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 text-center">Pages Analyzed</span>
                </CardContent>
              </Card>
            )}
            {metadata.photos_matched != null && (
              <Card className="animate-in fade-in slide-in-from-bottom-4 duration-500 border-slate-200/60 shadow-sm rounded-xl overflow-hidden">
                <CardContent className="flex flex-col items-center justify-center p-5 sm:p-6 bg-emerald-50/30">
                  <span className="text-3xl font-black tracking-tight text-emerald-600 mb-1">{metadata.photos_matched}</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 text-center">Photos Matched</span>
                </CardContent>
              </Card>
            )}
            {metadata.costs && (metadata.costs.ai_parse || metadata.costs.analyze_pages) && (
              <Card className="animate-in fade-in slide-in-from-bottom-4 duration-500 border-slate-200/60 shadow-sm rounded-xl overflow-hidden">
                <CardContent className="flex flex-col items-center justify-center p-5 sm:p-6 bg-amber-50/30">
                  <span className="flex items-center text-3xl font-black tracking-tight text-amber-600 mb-1">
                    <span className="text-xl -mt-1 mr-0.5">$</span>
                    {(metadata.costs.total_usd ?? ((metadata.costs.ai_parse?.cost_usd ?? 0) + (metadata.costs.analyze_pages?.cost_usd ?? 0))).toFixed(3).replace(/^0+/, '')}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 text-center">AI Cost</span>
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}

      {/* Completion celebration */}
      {isComplete && (
        <div className="mt-8 flex items-center justify-center gap-3 animate-in fade-in duration-700 bg-emerald-50 border border-emerald-200 p-4 rounded-xl shadow-sm">
          <CheckCircle className="h-6 w-6 text-emerald-600" />
          <span className="text-lg font-bold tracking-tight text-emerald-900">All done! Loading results...</span>
        </div>
      )}

      {/* Global failure message */}
      {isFailed && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex items-start gap-3">
            <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
            <div>
              <p className="font-medium text-red-800">Parsing failed</p>
              <p className="mt-1 text-sm text-red-600">
                {steps.find(s => s.status === 'failed')?.message || 'An unexpected error occurred during processing.'}
              </p>
              <p className="mt-2 text-xs text-red-400">
                Please try uploading the PDF again, or contact support if this persists.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
