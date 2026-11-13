"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { RouterOutputs } from "@/lib/trpc";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { chartColors } from "./constants";
import { formatChartDate } from "./formatters";
import { ChartSkeleton, EmptyChart } from "./metric-card";

type RatingSummary = RouterOutputs["analytics"]["getRatingSummary"];

export function ResponseRatingsCard({
  isLoading,
  data,
}: {
  isLoading: boolean;
  data: RatingSummary | undefined;
}) {
  const chartData =
    data?.daily.map((day) => ({ ...day, date: formatChartDate(day.date) })) ??
    [];

  return (
    <Card className="border border-border/60 shadow-xs xl:col-span-2">
      <CardHeader>
        <CardTitle>Response Ratings</CardTitle>
        <CardDescription>
          Student thumbs up and thumbs down on answers, last 30 days
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <ChartSkeleton />
        ) : !data || data.totalRatings === 0 ? (
          <EmptyChart label="No ratings in the last 30 days" />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[14rem_1fr] gap-6">
            <div className="space-y-4">
              <div>
                <div className="text-3xl font-bold">
                  {data.helpfulPercentage}%
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Rated helpful
                </p>
              </div>
              <div>
                <div className="text-3xl font-bold">{data.totalRatings}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Total ratings: {data.helpfulCount} thumbs up,{" "}
                  {data.totalRatings - data.helpfulCount} thumbs down
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                A rating is the student&apos;s impression of an answer, not a
                measure of whether it was correct.
              </p>
            </div>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 5, right: 16, left: -10, bottom: 5 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={chartColors.grid}
                    opacity={0.3}
                    vertical={false}
                  />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: chartColors.tick }}
                    tickLine={false}
                    axisLine={false}
                    dy={8}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: chartColors.tick }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: chartColors.card,
                      border: `1px solid ${chartColors.border}`,
                      borderRadius: "8px",
                      fontSize: "13px",
                    }}
                    itemStyle={{ color: "var(--foreground)" }}
                  />
                  <Legend
                    iconType="square"
                    iconSize={10}
                    wrapperStyle={{ paddingTop: 12 }}
                    formatter={(value) => (
                      <span className="text-xs text-muted-foreground">
                        {value}
                      </span>
                    )}
                  />
                  {/* The card-colored stroke separates a day's two segments. */}
                  <Bar
                    dataKey="up"
                    name="Thumbs up"
                    stackId="ratings"
                    fill={chartColors.ratingUp}
                    stroke={chartColors.card}
                    strokeWidth={2}
                    maxBarSize={24}
                  />
                  <Bar
                    dataKey="down"
                    name="Thumbs down"
                    stackId="ratings"
                    fill={chartColors.ratingDown}
                    stroke={chartColors.card}
                    strokeWidth={2}
                    maxBarSize={24}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
