package authz

const ResourceReferral = "referral"

var (
	ReferralRead   = Permission{Resource: ResourceReferral, Action: "read"}
	ReferralManage = Permission{Resource: ResourceReferral, Action: "manage"}
	ReferralSettle = Permission{Resource: ResourceReferral, Action: "settle"}
)

func init() {
	RegisterResource(ResourceDefinition{Resource: ResourceReferral, LabelKey: "Referral", Actions: []ActionDefinition{
		{Action: "read", LabelKey: "View referral data", DescriptionKey: "View referral commission records, settlements and debts.", DefaultRoles: []string{BuiltInRoleAdmin}},
		{Action: "manage", LabelKey: "Manage referral campaigns", DescriptionKey: "Create, edit and cancel referral commission campaigns."},
		{Action: "settle", LabelKey: "Settle referral commissions", DescriptionKey: "Adjust credit times, reverse records and forgive referral debts."},
	}})
}
