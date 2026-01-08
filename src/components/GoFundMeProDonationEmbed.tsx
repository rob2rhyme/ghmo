type Props = {
  campaignId: string;
};

export function GoFundMeProDonationEmbed({ campaignId }: Props) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm md:p-4">
      <div
        className="gfm-embed"
        data-campaign-id={campaignId}
        data-mode="donate"
        style={{ minHeight: 420 }}
      >
        <p className="text-sm text-slate-600">Donation form loading...</p>
      </div>
    </div>
  );
}
