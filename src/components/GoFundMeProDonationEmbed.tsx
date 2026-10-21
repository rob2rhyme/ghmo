type Props = {
  campaignId: string;
};

export function GoFundMeProDonationEmbed({ campaignId }: Props) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-xs md:p-4">
      <div
        className="gfm-embed"
        data-campaign-id={campaignId}
        data-mode="donate"
        style={{ minHeight: 420 }}
      >
        <p className="text-sm text-muted-foreground">Donation form loading...</p>
      </div>
    </div>
  );
}
