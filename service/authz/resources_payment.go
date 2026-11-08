package authz

const ResourcePayment = "payment"

var (
	PaymentRead    = Permission{Resource: ResourcePayment, Action: "read"}
	PaymentOperate = Permission{Resource: ResourcePayment, Action: "operate"}
	PaymentReview  = Permission{Resource: ResourcePayment, Action: "review"}
)

func init() {
	RegisterResource(ResourceDefinition{Resource: ResourcePayment, LabelKey: "Payment exceptions", Actions: []ActionDefinition{
		{Action: "read", LabelKey: "View payment exceptions", DescriptionKey: "View verified payment evidence and fulfillment status."},
		{Action: "operate", LabelKey: "Retry payment fulfillment", DescriptionKey: "Retry the original verified payment with a recorded reason."},
		{Action: "review", LabelKey: "Review payment refunds", DescriptionKey: "Resolve verified refund or chargeback evidence and record the entitlement decision."},
	}})
}
