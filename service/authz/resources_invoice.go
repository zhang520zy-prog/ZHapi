package authz

const ResourceInvoice = "invoice"

var (
	InvoiceRead   = Permission{Resource: ResourceInvoice, Action: "read"}
	InvoiceReview = Permission{Resource: ResourceInvoice, Action: "review"}
)

func init() {
	RegisterResource(ResourceDefinition{Resource: ResourceInvoice, LabelKey: "Invoice", Actions: []ActionDefinition{
		{Action: "read", LabelKey: "View invoices", DescriptionKey: "List and inspect invoice requests.", DefaultRoles: []string{BuiltInRoleAdmin}},
		{Action: "review", LabelKey: "Review invoices", DescriptionKey: "Approve, issue or reject invoice requests."},
	}})
}
