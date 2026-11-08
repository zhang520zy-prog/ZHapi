package authz

const ResourceDistributor = "distributor"

var (
	DistributorRead   = Permission{Resource: ResourceDistributor, Action: "read"}
	DistributorReview = Permission{Resource: ResourceDistributor, Action: "review"}
	DistributorManage = Permission{Resource: ResourceDistributor, Action: "manage"}
	DistributorSettle = Permission{Resource: ResourceDistributor, Action: "settle"}
)

func init() {
	RegisterResource(ResourceDefinition{Resource: ResourceDistributor, LabelKey: "Distributor", Actions: []ActionDefinition{
		{Action: "read", LabelKey: "View distribution data", DescriptionKey: "View distributor applications, profiles, commission records, settlements and debts.", DefaultRoles: []string{BuiltInRoleAdmin}},
		{Action: "review", LabelKey: "Review distributor applications", DescriptionKey: "Approve or reject distributor applications.", DefaultRoles: []string{BuiltInRoleAdmin}},
		{Action: "manage", LabelKey: "Manage distributors and campaigns", DescriptionKey: "Edit personal rates, hold days, suspend profiles, and manage commission campaigns."},
		{Action: "settle", LabelKey: "Settle commissions", DescriptionKey: "Confirm commissions, adjust credit times, reverse records, review withdrawals, forgive debts and backfill."},
	}})
}
