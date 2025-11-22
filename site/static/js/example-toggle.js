$(function() {
	$(".lang-toggle").click(function() {
		var language = $(this).data("language");
		$("details.example").hide();
		var targetDetails = $("details.example[data-language='"+language+"']");
		targetDetails.show();
        // Ensure the corresponding details element is expanded
		targetDetails.attr('open', 'open');
	});

    var defaultLanguage = "C";
    $("details.example[data-language='" + defaultLanguage + "']").show();
});
