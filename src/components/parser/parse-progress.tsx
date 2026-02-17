'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
} from 'lucide-react';
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

function formatDuration(startIso: string, endIso: string): string {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

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
    if (parseStatus === 'completed' || parseStatus === 'failed') return;
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
    if (parseStatus === 'completed' || parseStatus === 'failed') return;

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

  const steps = metadata?.steps || [];

  // Compute overall progress
  const progress = steps.reduce((acc, step) => {
    if (!VISIBLE_STEPS.includes(step.step)) return acc;
    if (step.status === 'completed') return acc + STEP_WEIGHT;
    if (step.status === 'running') return acc + STEP_WEIGHT * 0.5;
    return acc;
  }, 0);

  // Format elapsed for a running step
  const formatStepElapsed = (startIso: string): string => {
    const secs = Math.floor((Date.now() - new Date(startIso).getTime()) / 1000);
    if (secs < 60) return `${secs}s`;
    return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  };

  // Filter to only visible steps, keeping order
  const visibleSteps = VISIBLE_STEPS.map(name =>
    steps.find(s => s.step === name) || { step: name, status: 'pending' as const },
  );

  const isFailed = parseStatus === 'failed';
  const isComplete = parseStatus === 'completed';

  return (
    <div className={`rounded-xl border bg-white p-6 transition-colors ${
      isFailed ? 'border-red-300 bg-red-50/30' : ''
    }`}>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">
            {isFailed ? 'Parse Failed' :
             isComplete ? 'Parse Complete!' :
             'AI Processing Your NOI...'}
          </h3>
          {!isFailed && !isComplete && (
            <p className="text-sm text-gray-500">This typically takes 30-60 seconds</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-sm text-gray-400">
          <Clock className="h-4 w-4" />
          <span className="tabular-nums">{formatSeconds(elapsed)}</span>
        </div>
      </div>

      {/* Overall Progress Bar */}
      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-medium text-gray-700">Overall Progress</span>
          <span className="tabular-nums text-gray-500">{Math.round(progress)}%</span>
        </div>
        <Progress value={progress} className="h-2.5" />
      </div>

      {/* Step Timeline */}
      <div className="relative">
        {visibleSteps.map((step, index) => {
          const config = STEP_CONFIG[step.step];
          const isLast = index === visibleSteps.length - 1;
          const isActive = step.status === 'running';
          const isDone = step.status === 'completed';
          const isStepFailed = step.status === 'failed';
          const isPending = step.status === 'pending';
          const StepIcon = config?.icon || Circle;

          return (
            <div key={step.step} className="relative flex gap-4 pb-6 last:pb-0">
              {/* Vertical connecting line */}
              {!isLast && (
                <div className={`absolute left-[15px] top-[32px] h-[calc(100%-16px)] w-0.5 transition-colors duration-500 ${
                  isDone ? 'bg-green-300' : 'bg-gray-200'
                }`} />
              )}

              {/* Step icon circle */}
              <div className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-500 ${
                isDone ? 'border-green-500 bg-green-50' :
                isActive ? 'animate-breathe border-blue-500 bg-blue-50' :
                isStepFailed ? 'border-red-500 bg-red-50' :
                'border-gray-200 bg-white'
              }`}>
                {isDone && <CheckCircle className="h-5 w-5 text-green-500" />}
                {isActive && <Loader2 className="h-5 w-5 animate-spin text-blue-500" />}
                {isStepFailed && <XCircle className="h-5 w-5 text-red-500" />}
                {isPending && <StepIcon className="h-4 w-4 text-gray-300" />}
              </div>

              {/* Step content */}
              <div className={`flex-1 transition-opacity duration-500 ${
                isPending ? 'opacity-40' : 'opacity-100'
              }`}>
                <div className="flex items-center gap-2">
                  <p className={`text-sm font-semibold ${
                    isActive ? 'text-blue-700' :
                    isDone ? 'text-green-700' :
                    isStepFailed ? 'text-red-700' :
                    'text-gray-400'
                  }`}>
                    {config?.label || step.step}
                  </p>
                  {/* Duration badge for completed steps */}
                  {isDone && step.started_at && step.completed_at && (
                    <Badge variant="outline" className="text-xs text-gray-400">
                      {formatDuration(step.started_at, step.completed_at)}
                    </Badge>
                  )}
                  {/* Elapsed badge for running step */}
                  {isActive && step.started_at && (
                    <Badge variant="outline" className="animate-pulse text-xs text-blue-400">
                      {formatStepElapsed(step.started_at)}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-gray-500">
                  {step.message || config?.description}
                </p>
                {/* Error display */}
                {isStepFailed && (step.error || step.message) && (
                  <div className="mt-2 flex items-start gap-2 rounded-md bg-red-50 p-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                    <p className="text-xs text-red-600">{step.error || step.message}</p>
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
          <Separator className="my-5" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {metadata.items_found != null && (
              <Card className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                <CardContent className="flex flex-col items-center p-4">
                  <span className="text-2xl font-bold text-blue-600">{metadata.items_found}</span>
                  <span className="text-xs text-gray-500">Violations Found</span>
                </CardContent>
              </Card>
            )}
            {metadata.total_pages != null && (
              <Card className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                <CardContent className="flex flex-col items-center p-4">
                  <span className="text-2xl font-bold text-indigo-600">{metadata.total_pages}</span>
                  <span className="text-xs text-gray-500">Pages Analyzed</span>
                </CardContent>
              </Card>
            )}
            {metadata.photos_matched != null && (
              <Card className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                <CardContent className="flex flex-col items-center p-4">
                  <span className="text-2xl font-bold text-green-600">{metadata.photos_matched}</span>
                  <span className="text-xs text-gray-500">Photos Matched</span>
                </CardContent>
              </Card>
            )}
            {metadata.costs && (metadata.costs.ai_parse || metadata.costs.analyze_pages) && (
              <Card className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                <CardContent className="flex flex-col items-center p-4">
                  <span className="flex items-center text-2xl font-bold text-amber-600">
                    <DollarSign className="h-5 w-5" />
                    {(metadata.costs.total_usd ?? ((metadata.costs.ai_parse?.cost_usd ?? 0) + (metadata.costs.analyze_pages?.cost_usd ?? 0))).toFixed(4)}
                  </span>
                  <span className="text-xs text-gray-500">AI Cost</span>
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}

      {/* Completion celebration */}
      {isComplete && (
        <div className="mt-6 flex items-center justify-center gap-2 animate-in fade-in duration-700">
          <CheckCircle className="h-6 w-6 text-green-500" />
          <span className="text-lg font-semibold text-green-700">All done! Loading results...</span>
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
